import { prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import { deleteStorageObjectsOfOwnedProjects } from "@/lib/account";
import { requireSession } from "@/lib/session";

/**
 * Deletes every upload batch (and with it all LogFile/EncounterResult/... rows,
 * via FK cascade) in projects the current user owns. The projects themselves
 * and their members stay. Raw files in object storage are removed first.
 */
export async function DELETE() {
  const session = await requireSession();
  const userId = session.user.id;

  await deleteStorageObjectsOfOwnedProjects(userId);
  const { count } = await prisma.uploadBatch.deleteMany({
    where: { project: { ownerId: userId } },
  });

  return NextResponse.json({ deletedBatches: count });
}
