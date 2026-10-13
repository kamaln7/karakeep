import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefuddleClass } from "defuddle/node";
import { JSDOM } from "jsdom";
import { afterEach, expect, test, vi } from "vitest";

import { extractXContent } from "./xContent";

vi.mock("@karakeep/shared/logger", () => ({ default: { warn: vi.fn() } }));

const html = readFileSync(
  new URL("./fixtures/x-article.html", import.meta.url),
  "utf8",
);
const url = "https://x.com/janedoe/status/1234567890123456789";
const postHtml = `<html><head><meta property="og:title" content="Original post title"></head><body>
  <div data-testid="cellInnerDiv"><article data-testid="tweet">
    <div data-testid="User-Name"><a href="/janedoe">Jane Doe</a><a href="/janedoe">@janedoe</a></div>
    <div data-testid="tweetText"><span>First paragraph with useful context.

Second paragraph with </span><a href="https://example.com/components">a component library</a><span> and &lt;literal markup&gt;.</span></div>
  </article></div>
  <div data-testid="cellInnerDiv"><article data-testid="tweet">
    <div data-testid="User-Name"><a href="/reply">Someone else</a><a href="/reply">@reply</a></div>
    <div data-testid="tweetText">An unrelated reply that is not part of the saved post.</div>
  </article></div>
</body></html>`;

afterEach(() => vi.restoreAllMocks());

test("uses Defuddle's X article extractor without network requests", () => {
  const parse = vi.spyOn(DefuddleClass.prototype, "parse");
  const fetch = vi.spyOn(globalThis, "fetch");
  const result = extractXContent(html, url);
  expect(result?.extractorType).toBe("xarticle");
  expect(result?.title).toBe("Lorem Ipsum Dolor Sit Amet");
  expect(result?.author).toBe("@janedoe");
  expect(result?.content).toContain(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  );
  expect(parse).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});

test("keeps existing extraction for other sites, missing X markup, and library errors", () => {
  expect(extractXContent(html, "https://example.com/article")).toBeNull();
  expect(extractXContent(html, "invalid")).toBeNull();
  expect(extractXContent("<p>No X post markup</p>", url)).toBeNull();
  vi.spyOn(DefuddleClass.prototype, "parse").mockImplementation(() => {
    throw new Error("parser failed");
  });
  expect(extractXContent(html, url)).toBeNull();
});

test("uses the first eight content words only when an article has no title", () => {
  const untitled = html
    .replace(
      '<div data-testid="twitter-article-title">Lorem Ipsum Dolor Sit Amet</div>',
      "",
    )
    .replace("elit.", "elit. More words beyond the fallback title.");
  expect(extractXContent(untitled, url)?.title).toBe(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  );
  expect(extractXContent(html, url)?.title).toBe("Lorem Ipsum Dolor Sit Amet");
});

test("extracts X post paragraphs and links without replies or network requests", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const result = extractXContent(postHtml, url);
  expect(result?.extractorType).toBe("twitter");
  const dom = new JSDOM(result?.content);
  try {
    const paragraphs = [...dom.window.document.querySelectorAll("p")];
    expect(paragraphs.map((p) => p.textContent)).toEqual([
      "First paragraph with useful context.",
      "Second paragraph with a component library and <literal markup>.",
    ]);
    expect(paragraphs[1].querySelector("a")?.href).toBe(
      "https://example.com/components",
    );
    expect(dom.window.document.querySelector("literal")).toBeNull();
    expect(result?.content).not.toContain("unrelated reply");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    dom.window.close();
  }
});

test("titles posts with a word-boundary excerpt of their text", () => {
  expect(extractXContent(postHtml, url)?.title).toBe(
    "First paragraph with useful context. Second paragraph with a component library…",
  );
  const short = postHtml.replace(
    /<div data-testid="tweetText">[\s\S]*?<\/div>/,
    '<div data-testid="tweetText">Short post.</div>',
  );
  expect(extractXContent(short, url)?.title).toBe("Short post.");
});

test("takes the author from the post URL when the post has no User-Name block", () => {
  // Without X's User-Name block Defuddle still finds the post, but reports its
  // author as a bare "@".
  const noUserName = `<html><body><div data-testid="cellInnerDiv"><article data-testid="tweet">
    <div data-testid="tweetText">Short post.</div>
  </article></div></body></html>`;
  const result = extractXContent(noUserName, url);
  expect(result?.extractorType).toBe("twitter");
  expect(result?.author).toBe("@janedoe");
  expect(result?.title).toBe("Short post.");
  const noHandle = extractXContent(
    noUserName,
    "https://x.com/i/status/1234567890123456789",
  );
  expect(noHandle?.author).toBe("");
});

test.each([
  ["article", html, false],
  ["article", html, true],
  ["post", postHtml, false],
  ["post", postHtml, true],
] as const)(
  "parser subprocess sanitizes %s output (case %#)",
  async (kind, inputHtml, metadataOnly) => {
    const source = inputHtml
      .replace("</body>", "<script>alert(1)</script></body>")
      .replace(
        "</span>",
        '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">test</a></span>',
      );
    const tempDir = await mkdtemp(join(tmpdir(), "x-content-test-"));
    try {
      const htmlPath = join(tempDir, "page.html");
      await writeFile(htmlPath, source);
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/parseHtmlSubprocess.ts"],
        {
          cwd: fileURLToPath(new URL("../../", import.meta.url)),
          env: { ...process.env, NO_COLOR: "true" },
          input: JSON.stringify({
            htmlPath,
            url,
            jobId: "x-article-test",
            metadataOnly,
          }),
          encoding: "utf8",
          timeout: 15000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const output = JSON.parse(result.stdout);
      if (metadataOnly) {
        expect(output.readableContent).toBeNull();
      } else {
        expect(output.metadata.title).toMatch(
          kind === "article"
            ? /^Lorem Ipsum Dolor Sit Amet$/
            : /^First paragraph with useful context\. .*…$/,
        );
        expect(output.readableContent.content).toContain(
          kind === "article"
            ? "Lorem ipsum dolor sit amet"
            : "Second paragraph with",
        );
        expect(output.readableContent.content).not.toMatch(
          /onerror|javascript:|<script/,
        );
        expect(output.readerViewAssessment.status).not.toBe("unavailable");
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
);
