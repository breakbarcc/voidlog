/**
 * Reduces a post-login redirect target to a path on this site. Auth.js's
 * proxy passes the *absolute* URL of the page the user was bounced from as
 * `callbackUrl`; anything user-controlled that reaches `signIn()` or
 * `redirect()` must never be able to leave the site, so only path + query
 * are kept and the origin is discarded.
 */
export function safeRedirectPath(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value === "") {
    return "/";
  }
  try {
    const url = new URL(value, "http://placeholder.invalid");
    // "javascript:…" and friends parse to an opaque path with no leading slash.
    // "//host/…" would be read as protocol-relative by the browser.
    if (!url.protocol.startsWith("http") || url.pathname.startsWith("//")) {
      return "/";
    }
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}
