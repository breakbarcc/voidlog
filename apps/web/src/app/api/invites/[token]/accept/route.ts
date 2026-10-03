import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/invites";
import { requireSession } from "@/lib/session";

/**
 * Redeems an invite link for the signed-in user. Deliberately a POST that
 * the invite page triggers from a button: link-preview bots (Discord
 * unfurling a pasted link, say) only ever GET, so they can't burn a use.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await requireSession();

  const result = await acceptInvite(token, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.state },
      { status: result.state === "not_found" ? 404 : 410 },
    );
  }
  return NextResponse.json({ projectId: result.projectId, joined: result.joined });
}
