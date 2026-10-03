import { createHash, randomBytes } from "node:crypto";
import { ProjectRole, prisma } from "@voidlog/db";

export const INVITE_EXPIRY_DAYS = [1, 7, 30] as const;
export const INVITE_MAX_USES_OPTIONS = [1, 5, 10, 25] as const;
/** Upper bound on simultaneously valid links per project, to keep abuse cheap to contain. */
export const MAX_ACTIVE_INVITES = 20;

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Tokens carry 256 bits of entropy, so an unsalted SHA-256 is enough — and,
 * unlike a salted hash, still allows an indexed lookup by token.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteState = "valid" | "not_found" | "expired" | "exhausted";

export function inviteState(
  invite: { expiresAt: Date; maxUses: number | null; useCount: number } | null,
): InviteState {
  if (!invite) return "not_found";
  if (invite.expiresAt.getTime() <= Date.now()) return "expired";
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return "exhausted";
  return "valid";
}

export type AcceptResult =
  | { ok: true; projectId: string; joined: boolean }
  | { ok: false; state: Exclude<InviteState, "valid"> };

/**
 * Redeems an invite for `userId`. Idempotent: someone who is already a
 * member just gets the project back — no use is consumed and, in
 * particular, their role is never changed (an invite can't downgrade an
 * admin, nor silently upgrade anyone).
 *
 * The invite row is locked for the duration so `maxUses` can't be exceeded
 * by concurrent redemptions.
 */
export async function acceptInvite(token: string, userId: string): Promise<AcceptResult> {
  const tokenHash = hashInviteToken(token);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM project_invites WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
    const invite = await tx.projectInvite.findUnique({ where: { tokenHash } });

    const existing = invite
      ? await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId: invite.projectId, userId } },
        })
      : null;
    if (invite && existing) {
      return { ok: true, projectId: invite.projectId, joined: false } as const;
    }

    const state = inviteState(invite);
    if (!invite || state !== "valid") {
      return { ok: false, state: state === "valid" ? "not_found" : state } as const;
    }

    const created = await tx.projectMember.createMany({
      data: [{ projectId: invite.projectId, userId, role: invite.role }],
      skipDuplicates: true,
    });
    if (created.count > 0) {
      await tx.projectInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      });
    }
    return { ok: true, projectId: invite.projectId, joined: created.count > 0 } as const;
  });
}

export function isProjectRole(value: unknown): value is ProjectRole {
  return Object.values(ProjectRole).includes(value as ProjectRole);
}
