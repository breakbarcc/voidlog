import { ProjectRole, prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

/** Revokes an invite link by deleting it. Admins only. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; inviteId: string }> },
) {
  const { projectId, inviteId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.ADMIN);
  if (!access.ok) return access.response;

  // Scoped to the project so an admin can't revoke another project's invites.
  const { count } = await prisma.projectInvite.deleteMany({
    where: { id: inviteId, projectId },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
