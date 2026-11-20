import { prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import { SHARE_COOKIE_MAX_AGE_SECONDS, shareCookieName } from "@/lib/share-links";

/**
 * Opens a project's public read-only link: sets the project's share cookie
 * and sends the visitor on to the project, no sign-in needed. An unknown or
 * revoked token is a plain 404 — it doesn't say whether the project exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.projectShareLink.findUnique({
    where: { token },
    select: { projectId: true },
  });
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A relative Location, so it works behind a proxy whatever origin it sees.
  const response = new NextResponse(null, {
    status: 307,
    headers: {
      Location: `/projects/${link.projectId}`,
      // Share links are private: keep them out of indexes and referrers.
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
  response.cookies.set(shareCookieName(link.projectId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SHARE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
