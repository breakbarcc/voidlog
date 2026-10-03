import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/account";
import { requireSession } from "@/lib/session";

/**
 * Deletes the current user's account. Projects they are the sole admin of
 * are deleted with their logs; projects with another admin continue under
 * that admin (see `deleteAccount`).
 */
export async function DELETE() {
  const session = await requireSession();
  const plan = await deleteAccount(session.user.id);
  return NextResponse.json({
    deleted: true,
    deletedProjects: plan.deleted.length,
    transferredProjects: plan.transferred.length,
  });
}
