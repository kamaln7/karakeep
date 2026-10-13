import { MessageSquare } from "lucide-react";
import {
  EmbeddedTweet,
  enrichTweet,
  TweetContainer,
  TweetHeader,
  TweetNotFound,
  TweetSkeleton,
  useTweet,
} from "react-tweet";
import { z } from "zod";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

const articleSchema = z.object({
  rest_id: z.string().regex(/^\d+$/),
  title: z.string().min(1),
  preview_text: z.string().optional(),
  cover_media: z
    .object({
      media_info: z.object({ original_img_url: z.string().url() }),
    })
    .optional(),
});

function TweetPreview({ id }: { id: string }) {
  const { data, error, isLoading } = useTweet(id);
  if (isLoading) return <TweetSkeleton />;
  if (error || !data) return <TweetNotFound error={error} />;

  const article = articleSchema.safeParse(
    "article" in data ? data.article : undefined,
  ).data;
  if (!article) return <EmbeddedTweet tweet={data} />;

  return (
    <TweetContainer>
      <TweetHeader tweet={enrichTweet(data)} />
      <a
        href={`https://x.com/i/article/${article.rest_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="my-3 block overflow-hidden rounded-xl border hover:bg-muted/50"
      >
        {article.cover_media && (
          <img
            src={article.cover_media.media_info.original_img_url}
            alt=""
            className="aspect-[2/1] w-full object-cover"
          />
        )}
        <div className="space-y-2 p-4">
          <p className="font-semibold">{article.title}</p>
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {article.preview_text}
          </p>
        </div>
      </a>
    </TweetContainer>
  );
}

function extractTweetId(url: string): string | null {
  const patterns = [
    /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
    /(?:twitter\.com|x\.com)\/i\/web\/status\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function canRenderX(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }

  const url = bookmark.content.url;
  return extractTweetId(url) !== null;
}

function XRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const tweetId = extractTweetId(bookmark.content.url);
  if (!tweetId) {
    return null;
  }

  return (
    <div className="relative h-full w-full overflow-auto">
      <div className="flex justify-center p-4">
        <TweetPreview id={tweetId} />
      </div>
    </div>
  );
}

export const xRenderer: ContentRenderer = {
  id: "x",
  name: "X (Twitter)",
  icon: MessageSquare,
  canRender: canRenderX,
  component: XRendererComponent,
  priority: 10,
};
