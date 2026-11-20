import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Public read-only share links (`ProjectShareLink`): whoever opens
 * /share/<token> gets a cookie that lets them view that one project as a
 * VIEWER without signing in. See `requireProjectViewer` in lib/projects.ts.
 */

/** A month; opening the link again renews it. */
export const SHARE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** One cookie per project, so links to several projects can be open at once. */
export function shareCookieName(projectId: string): string {
  return `voidlog-share-${projectId}`;
}

/** Constant-time comparison, for the cookie's token against the project's. */
export function tokensMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
