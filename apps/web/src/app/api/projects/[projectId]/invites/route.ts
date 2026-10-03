import { ProjectRole, prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import {
  INVITE_EXPIRY_DAYS,
  INVITE_MAX_USES_OPTIONS,
  MAX_ACTIVE_INVITES,
  generateInviteToken,
  hashInviteToken,
  isProjectRole,
} from "@/lib/invites";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

interface CreateInviteBody {
  role?: unknown;
  expiresInDays?: unknown;
  maxUses?: unknown;
}

/**
 * Creates an invite link. Admins only. The plain token is returned exactly
 * once — only its hash is stored — so the client has to show it right away.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.ADMIN);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as CreateInviteBody | null;
  const expiresInDays = body?.expiresInDays;
  const maxUses = body?.maxUses ?? null;
  if (
    !isProjectRole(body?.role) ||
    !INVITE_EXPIRY_DAYS.includes(expiresInDays as (typeof INVITE_EXPIRY_DAYS)[number]) ||
    (maxUses !== null &&
      !INVITE_MAX_USES_OPTIONS.includes(maxUses as (typeof INVITE_MAX_USES_OPTIONS)[number]))
  ) {
    return NextResponse.json({ error: "Invalid invite settings" }, { status: 400 });
  }

  // Expired links are dead weight; sweep them out as a side effect of creating a new one.
  await prisma.projectInvite.deleteMany({ where: { projectId, expiresAt: { lte: new Date() } } });
  const activeCount = await prisma.projectInvite.count({ where: { projectId } });
  if (activeCount >= MAX_ACTIVE_INVITES) {
    return NextResponse.json({ error: "too_many_invites" }, { status: 409 });
  }

  const token = generateInviteToken();
  const invite = await prisma.projectInvite.create({
    data: {
      projectId,
      tokenHash: hashInviteToken(token),
      role: body.role,
      createdById: session.user.id,
      expiresAt: new Date(Date.now() + (expiresInDays as number) * 24 * 60 * 60 * 1000),
      maxUses: maxUses as number | null,
    },
  });

  return NextResponse.json({ id: invite.id, token });
}
