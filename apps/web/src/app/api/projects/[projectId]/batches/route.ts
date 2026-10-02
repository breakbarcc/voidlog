import { randomUUID } from "node:crypto";
import { ProjectRole, prisma } from "@voidlog/db";
import { createPresignedUploadUrl, createStorageClient } from "@voidlog/shared";
import { NextResponse } from "next/server";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

interface CreateBatchBody {
  label: string;
  files: { fileName: string }[];
}

/**
 * Creates an UploadBatch + one pending LogFile per selected file, and
 * returns a presigned PUT URL per file (ADR-003: the client uploads
 * directly to object storage, never through this server). Enqueuing the
 * actual parsing jobs is a separate call to POST /api/batches/[batchId]/enqueue
 * (step 2) once all uploads have completed client-side.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.CONTRIBUTOR);
  if (!access.ok) return access.response;

  const body = (await request.json()) as CreateBatchBody;
  if (!body.label?.trim() || !Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json(
      { error: "label and at least one file are required" },
      { status: 400 },
    );
  }

  const batch = await prisma.uploadBatch.create({
    data: { projectId, label: body.label.trim() },
  });

  const storageClient = createStorageClient();

  const files = await Promise.all(
    body.files.map(async (file) => {
      const storageKeyRaw = `raw/${batch.id}/${randomUUID()}-${sanitizeFileName(file.fileName)}`;
      const logFile = await prisma.logFile.create({
        data: { batchId: batch.id, storageKeyRaw, uploadedById: session.user.id },
      });
      const uploadUrl = await createPresignedUploadUrl(storageClient, storageKeyRaw, {
        contentType: "application/octet-stream",
      });
      return { logFileId: logFile.id, storageKey: storageKeyRaw, uploadUrl };
    }),
  );

  return NextResponse.json({ batchId: batch.id, files });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
