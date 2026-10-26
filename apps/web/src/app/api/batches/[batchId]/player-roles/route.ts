import { ProjectRole, prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import { assignableRoles, loadBossIds, parseRoleAssignment } from "@/lib/player-roles";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

/**
 * Overrides a player's project role for this batch only; `role: null` removes
 * the override, so the project's role counts again.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const session = await requireSession();

  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  const access = await checkProjectRole(batch.projectId, session.user.id, ProjectRole.CONTRIBUTOR);
  if (!access.ok) return access.response;

  const assignment = parseRoleAssignment(
    await request.json().catch(() => null),
    assignableRoles(await loadBossIds({ batchId })),
  );
  if (!assignment) {
    return NextResponse.json({ error: "Invalid role assignment" }, { status: 400 });
  }
  const { account, role } = assignment;

  if (role === null) {
    await prisma.batchPlayerRole.deleteMany({ where: { batchId, account } });
  } else {
    await prisma.batchPlayerRole.upsert({
      where: { batchId_account: { batchId, account } },
      create: { batchId, account, role },
      update: { role },
    });
  }
  return NextResponse.json({ account, role });
}
