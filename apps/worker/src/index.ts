import { Worker } from "bullmq";
import {
  createRedisConnection,
  LOG_PARSING_QUEUE_NAME,
  type LogParsingJobData,
} from "@voidlog/shared";
import { processLogFileJob } from "./job-processor";
import { createLogParser } from "./parsers/log-parser-factory";

/**
 * Worker service entry point (ADR-004). Consumes the log-parsing queue,
 * running each job through the configured LogParser (ADR-002) and the
 * extraction pipeline (ADR-008/009).
 */
function main(): void {
  const parser = createLogParser();
  const connection = createRedisConnection();

  const worker = new Worker<LogParsingJobData>(
    LOG_PARSING_QUEUE_NAME,
    async (job) => {
      // Each status change is reported only once it is in the database (see StatusListener).
      await processLogFileJob(job.data, parser, (status) => job.updateProgress({ status }));
    },
    {
      connection,
      // Global dps.report rate limit (ADR-002): 25 uploads / 60s, enforced
      // centrally here across all projects/batches, not per user.
      limiter: { max: 25, duration: 60_000 },
    },
  );

  worker.on("ready", () => console.log("[worker] ready, listening for log-parsing jobs"));
  worker.on("failed", (job, err) =>
    console.error(`[worker] job ${job?.id ?? "?"} failed:`, err.message),
  );

  const shutdown = async (): Promise<void> => {
    console.log("[worker] shutting down");
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main();
