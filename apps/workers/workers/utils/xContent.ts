import { DefuddleClass } from "defuddle/node";
import { JSDOM, VirtualConsole } from "jsdom";

import logger from "@karakeep/shared/logger";
import { htmlToPlainText } from "@karakeep/shared/utils/htmlUtils";

export function extractXContent(html: string, url: string) {
  if (
    !URL.canParse(url) ||
    !/^(www\.|mobile\.)?(x\.com|twitter\.com)$/.test(new URL(url).hostname)
  ) {
    return null;
  }

  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  try {
    const result = new DefuddleClass(dom.window.document, {
      url,
      includeReplies: false,
    }).parse();
    // Keep Karakeep's fallback when neither dedicated X extractor succeeds.
    if (
      !["xarticle", "twitter"].includes(result.extractorType ?? "") ||
      result.wordCount === 0
    ) {
      return null;
    }
    result.author = postAuthor(result.author, url);
    const words = htmlToPlainText(result.content).trim().split(/\s+/);
    if (result.title === "Untitled X Article") {
      result.title = words.slice(0, 8).join(" ");
    } else if (result.extractorType === "twitter") {
      // Defuddle titles posts "Post by @user on X"; name them by their text.
      // The handle stays in `author`.
      result.title = excerpt(words);
    }
    return result;
  } catch (error) {
    logger.warn("[Crawler] X extraction failed; using existing parser", error);
    return null;
  } finally {
    dom.window.close();
  }
}

// Defuddle reads the handle from X's `User-Name` block; when a post lacks it,
// Defuddle reports the author as a bare "@". The post URL
// (/<handle>/status/<id>) names the author either way.
function postAuthor(author: string, url: string) {
  if (/@\w{1,15}/.test(author)) {
    return author;
  }
  const handle = new URL(url).pathname.match(/^\/(\w{1,15})\/status\//)?.[1];
  return handle && handle !== "i" ? `@${handle}` : "";
}

const POST_TITLE_EXCERPT_LENGTH = 80;

function excerpt(words: string[]) {
  let text = "";
  for (const word of words) {
    const next = text ? `${text} ${word}` : word;
    if (next.length > POST_TITLE_EXCERPT_LENGTH) {
      return `${text || word.slice(0, POST_TITLE_EXCERPT_LENGTH)}…`;
    }
    text = next;
  }
  return text;
}
