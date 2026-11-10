import { LogFileStatus, prisma } from "@voidlog/db";
import type { LogParser, LogParsingJobData } from "@voidlog/shared";
import { getBossConfig } from "./boss-configs/registry";
import { extractEncounterFromStream } from "./extraction/extract-encounter";
import { persistExtractedEncounter } from "./extraction/persist-encounter";

/**
 * Called after every status change has been written. The upload page only
 * re-reads statuses when the queue reports progress, so the event must come
 * after the write — sent before it, the page reads the old status and a
 * step looks skipped.
 */
export type StatusListener = (status: LogFileStatus) => Promise<void>;

export async function processLogFileJob(
  data: LogParsingJobData,
  parser: LogParser,
  onStatus: StatusListener = async () => {},
): Promise<void> {
  const logFile = await prisma.logFile.findUnique({ where: { id: data.logFileId } });
  if (!logFile) {
    // The batch was deleted (e.g. its upload cancelled) after this job got queued.
    console.warn(`[worker] log file ${data.logFileId} no longer exists, skipping`);
    return;
  }

  try {
    // Upload to dps.report and wait until its Elite Insights JSON is ready.
    await setStatus(logFile.id, {
      status: LogFileStatus.UPLOADING,
      errorMessage: null,
      externalReportUrl: null,
    });
    await onStatus(LogFileStatus.UPLOADING);
    const { reportUrl, jsonStream } = await parser.parse(logFile.storageKeyRaw);

    // voidlog's own part: stream the JSON, extract and persist it. The report
    // link is stored right away, so a failure from here on reads as a
    // processing failure rather than an upload one.
    await setStatus(logFile.id, { status: LogFileStatus.PARSING, externalReportUrl: reportUrl });
    await onStatus(LogFileStatus.PARSING);
    const extracted = await extractEncounterFromStream(jsonStream);

    const bossId =
      extracted.root.triggerID !== undefined ? String(extracted.root.triggerID) : undefined;
    const bossConfig = bossId ? getBossConfig(bossId) : undefined;

    await persistExtractedEncounter(logFile.id, extracted, bossConfig);

    await setStatus(logFile.id, { status: LogFileStatus.DONE });
  } catch (error) {
    const stillExists = await setStatus(logFile.id, {
      status: LogFileStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    if (!stillExists) {
      console.warn(`[worker] log file ${logFile.id} was deleted while parsing, dropping result`);
      return;
    }
    throw error;
  }
}

/** updateMany: the row may be gone if the batch was deleted mid-job. Returns whether it still exists. */
async function setStatus(
  logFileId: string,
  data: { status: LogFileStatus; errorMessage?: string | null; externalReportUrl?: string | null },
): Promise<boolean> {
  const { count } = await prisma.logFile.updateMany({ where: { id: logFileId }, data });
  return count > 0;
}
