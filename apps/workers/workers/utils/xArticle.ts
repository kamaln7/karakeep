import { DefuddleClass } from "defuddle/node";
import { JSDOM, VirtualConsole } from "jsdom";

import logger from "@karakeep/shared/logger";

export function extractXArticle(html: string, url: string) {
  if (
    !URL.canParse(url) ||
    !/^(www\.|mobile\.)?(x\.com|twitter\.com)$/.test(new URL(url).hostname) ||
    // Cheap pre-check for Defuddle's article container so plain tweets skip
    // the JSDOM parse entirely.
    // ref: https://github.com/kepano/defuddle/blob/a332b4d5d539066ddfe19fc4ef6f1b6ffaf914b8/src/extractors/x-article.ts#L7
    !html.includes('data-testid="twitterArticleRichTextView"')
  ) {
    return null;
  }

  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  try {
    const result = new DefuddleClass(dom.window.document, { url }).parse();
    // Only adopt Defuddle's dedicated article extraction, not its tweet or
    // generic page extractors. Keep Karakeep's existing fallback for those.
    return result.extractorType === "xarticle" && result.wordCount > 0
      ? result
      : null;
  } catch (error) {
    logger.warn(
      "[Crawler] X article extraction failed; using existing parser",
      error,
    );
    return null;
  } finally {
    dom.window.close();
  }
}
