// Hides the sign-in prompts X shows logged-out visitors, so they don't cover
// the post in screenshots and PDFs: the fixed "Continue to X" bar over the
// replies, the sidebar sign-up card, and the "Scan to get the app" QR button.
// X's web app has no data-testid hooks on these, so the selectors key on the
// onboarding links and the QR image instead of its generated class names.
import type { Page } from "patchright";

import logger from "@karakeep/shared/logger";

const X_HOST = /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/;

const X_LOGIN_PROMPTS_CSS = `
aside:has(a[href*="/onboarding/"]),
button:has(> span + img[src^="data:image/svg+xml"]) {
  display: none !important;
}`;

export async function hideXLoginPrompts(page: Page, jobId: string) {
  if (!X_HOST.test(new URL(page.url()).hostname)) {
    return;
  }
  try {
    await page.addStyleTag({ content: X_LOGIN_PROMPTS_CSS });
  } catch (e) {
    logger.warn(
      `[Crawler][${jobId}] Failed to hide X login prompts, capturing as is: ${e}`,
    );
  }
}
