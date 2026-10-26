import { ProjectRole, prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import { assignableRoles, loadBossIds, parseRoleAssignment } from "@/lib/player-roles";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

/** Sets (or with `role: null` removes) a player's role for the whole project. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.CONTRIBUTOR);
  if (!access.ok) return access.response;

  const assignment = parseRoleAssignment(
    await request.json().catch(() => null),
    assignableRoles(await loadBossIds({ projectId })),
  );
  if (!assignment) {
    return NextResponse.json({ error: "Invalid role assignment" }, { status: 400 });
  }
  const { account, role } = assignment;

  if (role === null) {
    await prisma.projectPlayerRole.deleteMany({ where: { projectId, account } });
  } else {
    await prisma.projectPlayerRole.upsert({
      where: { projectId_account: { projectId, account } },
      create: { projectId, account, role },
      update: { role },
    });
  }
  return NextResponse.json({ account, role });
}
