import { prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import { deleteStorageObjectsOfOwnedProjects } from "@/lib/account";
import { requireSession } from "@/lib/session";

/**
 * Deletes the current user's account: all projects they own (including their
 * logs, raw files and other members' access to them), then the user row
 * itself. Memberships in other projects, Auth.js accounts and sessions cascade
 * away with the user. Project.ownerId has no ON DELETE CASCADE, so owned
 * projects must go first.
 */
export async function DELETE() {
  const session = await requireSession();
  const userId = session.user.id;

  await deleteStorageObjectsOfOwnedProjects(userId);
  await prisma.$transaction([
    prisma.project.deleteMany({ where: { ownerId: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return NextResponse.json({ deleted: true });
}
