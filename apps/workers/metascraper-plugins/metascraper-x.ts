import metascraperX from "metascraper-x";
import { resolveValidatedRedirectUrl } from "network";

import logger from "@karakeep/shared/logger";

// metascraper-x 5.50.0 supports resolveUrl, but its declaration omits options.
const withOptions = metascraperX as (options: {
  resolveUrl: (url: string) => Promise<string>;
}) => ReturnType<typeof metascraperX>;

export default () =>
  withOptions({
    resolveUrl: async (url: string) => {
      try {
        const parsed = new URL(url);
        if (
          parsed.hostname !== "t.co" ||
          !["http:", "https:"].includes(parsed.protocol)
        ) {
          return url;
        }
        return (
          await resolveValidatedRedirectUrl(url, {
            // Caps the total across all hops; the helper only times out per hop.
            signal: AbortSignal.timeout(5000),
          })
        ).toString();
      } catch (error) {
        // Expansion is best effort; keep the link if it is blocked or unavailable.
        logger.debug(`[Crawler] Failed to expand ${url}: ${error}`);
        return url;
      }
    },
  });
