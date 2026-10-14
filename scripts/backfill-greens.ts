import { Readable } from "node:stream";
import { Prisma, prisma } from "@voidlog/db";
import { GREENS_BY_BOSS } from "../apps/worker/src/boss-configs/greens";
import { extractEncounterFromStream } from "../apps/worker/src/extraction/extract-encounter";
import {
  greenEventContext,
  greenWaveContext,
  resolveGreenWaves,
} from "../apps/worker/src/extraction/green-waves";

/**
 * Backfills the Green circle/wave details (`MechanicEvent.context` on the
 * S.Green/F.Green rows and the Green.Spawn wave markers) for logs parsed
 * before the worker stored them. The raw EI JSON isn't kept, so it is fetched
 * again from dps.report via the log's `externalReportUrl`, run through the
 * same extraction and wave resolution as a new upload, and written onto the
 * existing rows.
 *
 *   pnpm backfill:greens                 # dry run over every log still missing it
 *   pnpm backfill:greens --apply         # write
 *   pnpm backfill:greens --log <id>      # one log file
 *   pnpm backfill:greens --limit 20      # first N logs only
 *
 * Rows are matched by (mechanic, timeMs): the three circles of a wave resolve
 * in the same millisecond and carry no actor in the DB, so which of the
 * identical rows gets which circle is arbitrary — but the set per wave is
 * exact, which is all anything reads.
 */

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyLogId = argValue("--log");
const limit = argValue("--limit") ? Number(argValue("--limit")) : undefined;

const baseUrl = process.env.DPS_REPORT_BASE_URL ?? "https://dps.report";
const jsonPath = process.env.DPS_REPORT_JSON_PATH ?? "/getJson";

const bossIds = Object.keys(GREENS_BY_BOSS);

const encounters = await prisma.encounterResult.findMany({
  where: {
    bossId: { in: bossIds },
    logFile: {
      externalReportUrl: { not: null },
      ...(onlyLogId ? { id: onlyLogId } : {}),
    },
    // Still missing: some resolution row without a circle context.
    phaseResults: {
      some: {
        mechanicEvents: {
          some: { mechanicName: "Green.Spawn", context: { equals: Prisma.DbNull } },
        },
      },
    },
  },
  select: {
    id: true,
    bossId: true,
    logFile: { select: { id: true, externalReportUrl: true, storageKeyRaw: true } },
  },
  orderBy: { createdAt: "asc" },
  ...(limit ? { take: limit } : {}),
});

console.log(`${encounters.length} log(s) to backfill${apply ? "" : " (dry run — pass --apply)"}`);

let done = 0;
let failed = 0;

for (const encounter of encounters) {
  const config = GREENS_BY_BOSS[encounter.bossId];
  const permalink = encounter.logFile.externalReportUrl;
  if (!config || !permalink) continue;
  const label = encounter.logFile.storageKeyRaw.split("/").at(-1);

  try {
    const response = await fetch(
      `${baseUrl}${jsonPath}?permalink=${encodeURIComponent(permalink)}`,
    );
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const extracted = await extractEncounterFromStream(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    );
    const waves = resolveGreenWaves(
      config,
      extracted.root,
      extracted.players,
      extracted.targets,
      extracted.root.phases,
    );

    const rows = await prisma.mechanicEvent.findMany({
      where: {
        phaseResult: { encounterResultId: encounter.id },
        mechanicName: { in: [config.successMechanic, config.failMechanic, "Green.Spawn"] },
      },
      select: { id: true, mechanicName: true, timeMs: true },
      orderBy: [{ timeMs: "asc" }, { id: "asc" }],
    });
    const rowsByKey = new Map<string, string[]>();
    for (const row of rows) {
      const key = `${row.mechanicName}@${row.timeMs}`;
      rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row.id]);
    }

    const updates: { id: string; context: Prisma.InputJsonValue }[] = [];
    for (const wave of waves) {
      const spawn = rowsByKey.get(`Green.Spawn@${Math.round(wave.timeMs)}`)?.shift();
      if (spawn) updates.push({ id: spawn, context: greenWaveContext(wave) });
      for (const green of wave.greens) {
        const name = green.result === "ok" ? config.successMechanic : config.failMechanic;
        const id = rowsByKey.get(`${name}@${Math.round(green.dataPoint.time)}`)?.shift();
        if (id) updates.push({ id, context: greenEventContext(wave, green) });
      }
    }

    if (apply) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.mechanicEvent.update({ where: { id: u.id }, data: { context: u.context } }),
        ),
      );
    }
    const failedWaves = waves.filter((w) => w.failed).length;
    console.log(
      `${apply ? "wrote" : "would write"} ${updates.length} rows, ${waves.length} waves (${failedWaves} failed) — ${label}`,
    );
    done += 1;
  } catch (error) {
    failed += 1;
    console.error(`FAILED ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  // dps.report is a shared service — don't hammer it.
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.log(`done: ${done}, failed: ${failed}`);
await prisma.$disconnect();
