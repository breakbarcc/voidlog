/**
 * Route protection (ADR-007). Named `proxy` per Next.js 16 (renamed from
 * `middleware` — same mechanism, see the Next.js 16 migration notes).
 * Auth.js's `auth` export doubles as this handler: it redirects
 * unauthenticated requests to /login for anything not explicitly excluded
 * below.
 */
export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    /*
     * Run on everything except:
     * - /login (the sign-in page itself)
     * - /datenschutz (public privacy policy)
     * - /api/auth/* (Auth.js's own endpoints)
     * - Next.js internals and static assets
     */
    "/((?!login|datenschutz|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
