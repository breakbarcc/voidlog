import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { LogFileStatus, prisma } from "@voidlog/db";
import { createStorageClient, putObjectBuffer } from "@voidlog/shared";

/**
 * End-to-end proof for the step-2 data/job flow (ADR-002/003/004/005):
 * seeds DB rows, uploads a test log to local storage, calls the batch
 * enqueue endpoint, and polls Postgres until the worker has produced an
 * EncounterResult with PhaseResult/MechanicEvent rows.
 *
 * Prerequisites: `docker compose up -d` and `pnpm dev` (web + worker)
 * running. Requires apps/web because the enqueue call goes through the
 * real Route Handler (ADR-004), not a Prisma call from this script.
 *
 * The enqueue route requires a logged-in project member, so the script
 * creates a short-lived database session for its own E2E user, sends it as
 * the Auth.js session cookie, and deletes it again at the end.
 *
 * By default the worker runs with LOG_PARSER=mock (see .env.example), so
 * this works fully offline. To exercise the real dps.report API instead,
 * set LOG_PARSER=dps-report and TEST_EVTC_PATH=/path/to/file.evtc, then
 * restart the worker and re-run this script.
 */

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const E2E_USER_EMAIL = "e2e-test-user@voidlog.local";
// Auth.js' default database-session cookie name on plain http (localhost).
// Behind https it would be "__Secure-authjs.session-token".
const SESSION_COOKIE_NAME = "authjs.session-token";

async function loadTestFileBuffer(): Promise<Buffer> {
  const path = process.env.TEST_EVTC_PATH;
  if (path) {
    console.log(`[e2e] reading real test file from TEST_EVTC_PATH="${path}"`);
    return readFile(path);
  }
  // A dps-report worker would upload the dummy buffer to the public
  // dps.report service (which rejects it anyway) — refuse instead.
  if (process.env.LOG_PARSER === "dps-report") {
    throw new Error(
      "LOG_PARSER=dps-report needs TEST_EVTC_PATH pointing at a real .evtc file " +
        "(or run the worker and this script with LOG_PARSER=mock).",
    );
  }
  console.log("[e2e] TEST_EVTC_PATH not set — using a dummy buffer (fine for LOG_PARSER=mock)");
  return Buffer.from("dummy-evtc-content-for-mock-parser");
}

async function pollUntilTerminal(logFileId: string): Promise<{
  status: LogFileStatus;
  errorMessage: string | null;
  externalReportUrl: string | null;
}> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const logFile = await prisma.logFile.findUniqueOrThrow({ where: { id: logFileId } });
    if (logFile.status === LogFileStatus.DONE || logFile.status === LogFileStatus.FAILED) {
      return logFile;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${POLL_TIMEOUT_MS}ms waiting for LogFile to finish (last status: ${logFile.status}).\n` +
          `Is "pnpm dev" running (apps/worker in particular)?`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

try {
  console.log(`[e2e] using web base URL: ${WEB_BASE_URL}`);

  console.log("[e2e] seeding test project/batch...");
  await prisma.project.deleteMany({ where: { name: "E2E Test Project" } });

  const owner = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: {},
    create: { email: E2E_USER_EMAIL, name: "E2E Test User" },
  });
  const sessionToken = randomUUID();
  await prisma.session.create({
    data: { sessionToken, userId: owner.id, expires: new Date(Date.now() + 15 * 60 * 1000) },
  });

  const project = await prisma.project.create({
    data: {
      name: "E2E Test Project",
      ownerId: owner.id,
      members: { create: { userId: owner.id, role: "ADMIN" } },
    },
  });

  const batch = await prisma.uploadBatch.create({
    data: { projectId: project.id, label: `E2E run ${new Date().toISOString()}` },
  });

  const rawFileBuffer = await loadTestFileBuffer();
  const storageKeyRaw = `raw/${batch.id}/${randomUUID()}.evtc`;

  console.log(`[e2e] uploading raw log to storage at key "${storageKeyRaw}"...`);
  const storageClient = createStorageClient();
  await putObjectBuffer(storageClient, storageKeyRaw, rawFileBuffer, "application/octet-stream");

  const logFile = await prisma.logFile.create({
    data: { batchId: batch.id, storageKeyRaw, status: LogFileStatus.PENDING },
  });

  console.log(`[e2e] calling POST /api/batches/${batch.id}/enqueue ...`);
  const enqueueResponse = await fetch(`${WEB_BASE_URL}/api/batches/${batch.id}/enqueue`, {
    method: "POST",
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
    // A missing/invalid session is answered with a redirect to /login —
    // surface that as a failed call instead of following it to HTML.
    redirect: "manual",
  });
  if (!enqueueResponse.ok) {
    throw new Error(
      `enqueue call failed: ${enqueueResponse.status} ${await enqueueResponse.text()}\n` +
        `Is "pnpm dev" running? (apps/web must be up for this call to succeed)`,
    );
  }
  const enqueueResult = (await enqueueResponse.json()) as { enqueued: number };
  console.log(`[e2e] enqueued ${enqueueResult.enqueued} job(s)`);

  console.log("[e2e] polling LogFile status (waiting for the worker)...");
  const finalStatus = await pollUntilTerminal(logFile.id);

  if (finalStatus.status === LogFileStatus.FAILED) {
    throw new Error(`LogFile processing failed: ${finalStatus.errorMessage ?? "unknown error"}`);
  }

  console.log("[e2e] LogFile done, loading extracted result from Postgres...");
  const encounter = await prisma.encounterResult.findUnique({
    where: { logFileId: logFile.id },
    include: {
      phaseResults: { include: { mechanicEvents: true }, orderBy: { order: "asc" } },
      playerResults: true,
    },
  });

  if (!encounter) {
    throw new Error("LogFile is DONE but no EncounterResult was found");
  }

  const totalMechanicEvents = encounter.phaseResults.reduce(
    (sum, p) => sum + p.mechanicEvents.length,
    0,
  );

  console.log("");
  console.log("=== E2E result ===");
  console.log(`Boss: ${encounter.bossName} (${encounter.bossId})`);
  console.log(`Success: ${encounter.success}, duration: ${encounter.durationMs}ms`);
  console.log(`Report URL: ${finalStatus.externalReportUrl ?? "-"}`);
  console.log(`Players: ${encounter.playerResults.length}`);
  console.log(`Phases: ${encounter.phaseResults.length}`);
  for (const phase of encounter.phaseResults) {
    console.log(
      `  - ${phase.name} (order ${phase.order}): ${phase.startMs}-${phase.endMs}ms, ` +
        `alive at start: ${phase.playersAliveAtStart}, mechanic events: ${phase.mechanicEvents.length}`,
    );
  }
  console.log(`Total mechanic events: ${totalMechanicEvents}`);
  console.log("==================");

  if (encounter.phaseResults.length === 0 || totalMechanicEvents === 0) {
    throw new Error("Expected at least one PhaseResult and one MechanicEvent, got none");
  }

  console.log("[e2e] OK — pipeline proven end to end.");
} catch (error) {
  console.error("[e2e] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  // Remove this run's session (and any left over from aborted runs).
  await prisma.session
    .deleteMany({ where: { user: { email: E2E_USER_EMAIL } } })
    .catch(() => undefined);
  await prisma.$disconnect();
}
