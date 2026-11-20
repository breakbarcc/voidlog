import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { shareCookieName } from "@/lib/share-links";

/**
 * Route protection (ADR-007). Named `proxy` per Next.js 16 (renamed from
 * `middleware` — same mechanism, see the Next.js 16 migration notes).
 * Auth.js's `auth` wraps the handler: signed-in requests pass, everything
 * else is redirected to /login for anything not excluded in `config` below —
 * except project pages for visitors holding that project's share cookie
 * (lib/share-links.ts). The cookie is only checked for presence here; the
 * pages validate it against the project's link (`requireProjectViewer`), and
 * every write route still requires a session.
 */
export const proxy = auth((request) => {
  if (request.auth) return;

  const project = /^\/projects\/([^/]+)/.exec(request.nextUrl.pathname);
  if (project && request.cookies.has(shareCookieName(project[1]!))) return;

  const login = new URL("/login", request.nextUrl.origin);
  login.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: [
    /*
     * Run on everything except:
     * - /login (the sign-in page itself)
     * - /share (public read-only links, they set the cookie themselves)
     * - /datenschutz (public privacy policy)
     * - /sitemap.xml, /robots.txt and the share preview images (crawlers have no session)
     * - /api/auth/* (Auth.js's own endpoints)
     * - Next.js internals and static assets
     */
    "/((?!login|share|datenschutz|sitemap\\.xml|robots\\.txt|opengraph-image|twitter-image|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
