import { LogFileStatus, ProjectRole, prisma } from "@voidlog/db";
import { createLogParsingQueueEvents } from "@voidlog/shared";
import { NextResponse } from "next/server";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events progress stream for a batch (ADR-004). Rather than
 * trying to map individual BullMQ job events to specific LogFile rows,
 * this re-reads the batch's LogFile statuses from Postgres on every
 * queue event and pushes a fresh snapshot — simple and always correct,
 * at the cost of a cheap extra query per event.
 */
export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const session = await requireSession();

  const batch = await prisma.uploadBatch.findUnique({
    where: { id: batchId },
    select: { projectId: true },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  const access = await checkProjectRole(batch.projectId, session.user.id, ProjectRole.VIEWER);
  if (!access.ok) return access.response;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const queueEvents = createLogParsingQueueEvents();

      function send(payload: unknown): void {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }

      function cleanup(): void {
        if (closed) return;
        closed = true;
        queueEvents.removeAllListeners();
        void queueEvents.close();
        try {
          controller.close();
        } catch {
          // stream already closed by the client
        }
      }

      async function pushSnapshot(): Promise<void> {
        const logFiles = await prisma.logFile.findMany({
          where: { batchId },
          select: { id: true, status: true, errorMessage: true },
          // Without an explicit order, Postgres doesn't guarantee row order
          // is stable across repeated queries — the progress table would
          // reshuffle on every SSE push. createdAt alone can tie (the
          // batch-creation route inserts all files concurrently), so id is
          // a secondary tiebreaker to make the order fully deterministic.
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const total = logFiles.length;
        const done = logFiles.filter((f) => f.status === LogFileStatus.DONE).length;
        const failed = logFiles.filter((f) => f.status === LogFileStatus.FAILED).length;

        send({ total, done, failed, files: logFiles });

        if (total > 0 && done + failed === total) {
          send({ event: "complete" });
          cleanup();
        }
      }

      queueEvents.on("progress", () => void pushSnapshot());
      queueEvents.on("completed", () => void pushSnapshot());
      queueEvents.on("failed", () => void pushSnapshot());

      request.signal.addEventListener("abort", cleanup);

      await pushSnapshot();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
