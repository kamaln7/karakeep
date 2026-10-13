import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { xRenderer } from "./XRenderer";

vi.stubGlobal("React", React);

const state = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  error: undefined as Error | undefined,
  isLoading: false,
}));
vi.mock("react-tweet", () => ({
  useTweet: () => state,
  enrichTweet: (tweet: unknown) => tweet,
  TweetContainer: ({ children }: { children: React.ReactNode }) => children,
  TweetHeader: () => "author",
  EmbeddedTweet: () => "regular tweet",
  TweetSkeleton: () => "loading",
  TweetNotFound: () => "not found",
}));

it("renders an article preview and preserves tweet/loading/error fallbacks", () => {
  const Component = xRenderer.component;
  const bookmark = {
    content: {
      type: "link",
      url: "https://x.com/author/status/123",
    },
  } as ZBookmark;
  const render = () =>
    renderToStaticMarkup(React.createElement(Component, { bookmark }));
  state.data = {
    article: {
      rest_id: "456",
      title: "Article <title>",
      preview_text: "Opening excerpt",
      cover_media: {
        media_info: { original_img_url: "https://pbs.twimg.com/cover.jpg" },
      },
    },
  };
  const html = render();
  expect(html).toContain('href="https://x.com/i/article/456"');
  expect(html).toContain("Article &lt;title&gt;");
  expect(html).toContain("Opening excerpt");
  expect(html).toContain('src="https://pbs.twimg.com/cover.jpg"');
  state.data = { article: { rest_id: "456", title: "No cover" } };
  expect(render()).toContain("No cover");
  state.data = { article: { rest_id: "javascript:bad", title: "Bad ID" } };
  expect(render()).toContain("regular tweet");
  state.data = {};
  expect(render()).toContain("regular tweet");
  state.isLoading = true;
  expect(render()).toContain("loading");
  state.isLoading = false;
  state.error = new Error("Unavailable");
  expect(render()).toContain("not found");
});
