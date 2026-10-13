import metascraper from "metascraper";
import metascraperDescription from "metascraper-description";
import { resolveValidatedRedirectUrl } from "network";
import { beforeEach, expect, test, vi } from "vitest";

import metascraperX from "./metascraper-x";

vi.mock("network", () => ({ resolveValidatedRedirectUrl: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

const parse = (description: string) =>
  metascraper([metascraperX(), metascraperDescription()])({
    url: "https://x.com/example/status/123",
    html: `<meta property="og:description" content="${description}">`,
    validateUrl: false,
  });

test("expands t.co links in the saved description using the validated resolver", async () => {
  vi.mocked(resolveValidatedRedirectUrl).mockResolvedValue(
    new URL("https://example.com/article"),
  );
  const meta = await parse(
    "Read https://t.co/abc and https://example.org/page",
  );
  expect(meta.description).toBe(
    "Read https://example.com/article and https://example.org/page",
  );
  expect(resolveValidatedRedirectUrl).toHaveBeenCalledExactlyOnceWith(
    "https://t.co/abc",
    { signal: expect.any(AbortSignal) },
  );
});

test("keeps the original link when resolution fails", async () => {
  vi.mocked(resolveValidatedRedirectUrl).mockRejectedValue(
    new Error("blocked"),
  );
  expect((await parse("Read https://t.co/abc")).description).toBe(
    "Read https://t.co/abc",
  );
});

test("does not fetch lookalike hosts or non-HTTP links", async () => {
  await parse("Read https://t.co.example.com/abc and ftp://t.co/abc");
  expect(resolveValidatedRedirectUrl).not.toHaveBeenCalled();
});
