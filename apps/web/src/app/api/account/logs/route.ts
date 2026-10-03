import { NextResponse } from "next/server";
import { deleteLogsUploadedBy } from "@/lib/account";
import { requireSession } from "@/lib/session";

/**
 * Deletes every log the current user uploaded, in all projects (batches left
 * empty included). Projects, members and other people's logs stay.
 */
export async function DELETE() {
  const session = await requireSession();
  const { deletedLogs } = await deleteLogsUploadedBy(session.user.id);
  return NextResponse.json({ deletedLogs });
}
