import { ProjectRole } from "@voidlog/db";
import { NextResponse } from "next/server";
import { changeMemberRole, removeMember, type MemberChangeResult } from "@/lib/members";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

type RouteContext = { params: Promise<{ projectId: string; memberId: string }> };

function toResponse(result: MemberChangeResult) {
  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}

/** Changes a member's role. Admins only. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { projectId, memberId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.ADMIN);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (!Object.values(ProjectRole).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  return toResponse(await changeMemberRole(projectId, memberId, role));
}

/**
 * Removes a member. Admins may remove anyone; every member may remove
 * themselves (= leave the project).
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { projectId, memberId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.VIEWER);
  if (!access.ok) return access.response;

  const isSelf = access.membership.id === memberId;
  if (!isSelf && access.membership.role !== ProjectRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return toResponse(await removeMember(projectId, memberId));
}
