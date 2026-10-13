import { expect, test } from "vitest";

import { BookmarkTypes, ZBookmark } from "../types/bookmarks";
import { getBookmarkTitle } from "./bookmarkUtils";

test.each([
  ["https://x.com/author/status/123", "(1) Author on X", "Author on X"],
  ["https://twitter.com/author/status/123", "(42) Author on X", "Author on X"],
  ["https://x.com/author/status/123", "An ordinary title", "An ordinary title"],
  ["https://example.com/post", "(1) First chapter", "(1) First chapter"],
  ["https://x.com.example.com/post", "(1) First chapter", "(1) First chapter"],
])(
  "cleans X notification counts in saved and crawled titles (%s)",
  (url, title, expected) => {
    for (const savedTitle of [title, null]) {
      const bookmark = {
        title: savedTitle,
        content: { type: BookmarkTypes.LINK, url, title },
      } as ZBookmark;
      expect(getBookmarkTitle(bookmark)).toBe(expected);
      expect(bookmark.title).toBe(savedTitle);
    }
  },
);
