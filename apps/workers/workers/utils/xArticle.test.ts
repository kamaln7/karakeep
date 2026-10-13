import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefuddleClass } from "defuddle/node";
import { afterEach, expect, test, vi } from "vitest";

import { extractXArticle } from "./xArticle";

vi.mock("@karakeep/shared/logger", () => ({ default: { warn: vi.fn() } }));

const html = readFileSync(
  new URL("./fixtures/x-article.html", import.meta.url),
  "utf8",
);
const url = "https://x.com/janedoe/status/1234567890123456789";

afterEach(() => vi.restoreAllMocks());

test("uses Defuddle's X article extractor without network requests", () => {
  const parse = vi.spyOn(DefuddleClass.prototype, "parse");
  const fetch = vi.spyOn(globalThis, "fetch");
  const result = extractXArticle(html, url);
  expect(result?.extractorType).toBe("xarticle");
  expect(result?.title).toBe("Lorem Ipsum Dolor Sit Amet");
  expect(result?.author).toBe("@janedoe");
  expect(result?.content).toContain(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  );
  expect(parse).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});

test("keeps existing extraction for other sites, non-articles, and library errors", () => {
  expect(extractXArticle(html, "https://example.com/article")).toBeNull();
  expect(extractXArticle(html, "invalid")).toBeNull();
  const parse = vi.spyOn(DefuddleClass.prototype, "parse");
  expect(extractXArticle("<p>A regular post</p>", url)).toBeNull();
  expect(parse).not.toHaveBeenCalled();
  vi.spyOn(DefuddleClass.prototype, "parse").mockImplementation(() => {
    throw new Error("parser failed");
  });
  expect(extractXArticle(html, url)).toBeNull();
});

test.each([false, true])(
  "parser subprocess wires article output and respects metadataOnly=%s",
  async (metadataOnly) => {
    const source = html
      .replace("</body>", "<script>alert(1)</script></body>")
      .replace(
        "consectetur",
        '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">consectetur</a>',
      );
    const tempDir = await mkdtemp(join(tmpdir(), "x-article-test-"));
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
        expect(output.metadata.title).toBe("Lorem Ipsum Dolor Sit Amet");
        expect(output.readableContent.content).toContain(
          "Lorem ipsum dolor sit amet",
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
