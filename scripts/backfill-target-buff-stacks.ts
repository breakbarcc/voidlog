import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { MechanicCategory, prisma } from "@voidlog/db";
import {
  TARGET_BUFF_STACKS_BY_BOSS,
  targetBuffStackEvents,
} from "../apps/worker/src/boss-configs/target-buff-stacks";
import { extractEncounterFromStream } from "../apps/worker/src/extraction/extract-encounter";

/**
 * One-off backfill for boss-config/target-buff-stacks.ts (e.g. the Void
 * Hearts' "Void Empowerment" behind the Voidwalker achievement): logs
 * processed before it existed have no such events. Only kills are
 * backfilled — an achievement can only come from a kill, and each log means
 * re-downloading its full EI JSON (tens of MB) from dps.report.
 *
 * Re-running is safe: encounters that already have the events are skipped.
 * Also prints every player's "Achievement Eligibility" buffs as a
 * cross-check against the stack rule.
 *
 *   pnpm backfill:target-buff-stacks
 */
const ELIGIBILITY_BUFF_IDS = new Map([[68066, "Voidwalker"]]);

const bossIds = Object.keys(TARGET_BUFF_STACKS_BY_BOSS);
const mechanicNames = [
  ...new Set(
    Object.values(TARGET_BUFF_STACKS_BY_BOSS).flatMap((c) => c.map((x) => x.mechanicName)),
  ),
];

const encounters = await prisma.encounterResult.findMany({
  where: {
    bossId: { in: bossIds },
    success: true,
    logFile: { externalReportUrl: { not: null } },
    phaseResults: { none: { mechanicEvents: { some: { mechanicName: { in: mechanicNames } } } } },
  },
  select: {
    id: true,
    bossId: true,
    recordedAt: true,
    logFile: { select: { externalReportUrl: true } },
    phaseResults: { select: { id: true, startMs: true, endMs: true } },
  },
});
console.log(`${encounters.length} kill(s) to backfill`);

for (const encounter of encounters) {
  const permalink = encounter.logFile.externalReportUrl!;
  const url = new URL("https://dps.report/getJson");
  url.searchParams.set("permalink", permalink);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    console.error(`  ${permalink}: dps.report answered ${response.status}, skipped`);
    continue;
  }
  const extracted = await extractEncounterFromStream(
    Readable.fromWeb(response.body as NodeWebReadableStream),
  );

  // Narrowest phase containing the time, same as persist-encounter.ts.
  const phaseAt = (timeMs: number) =>
    encounter.phaseResults
      .filter((p) => p.startMs <= timeMs && timeMs <= p.endMs)
      .sort((a, b) => a.endMs - a.startMs - (b.endMs - b.startMs))[0] ??
    [...encounter.phaseResults].sort((a, b) => b.endMs - b.startMs - (a.endMs - a.startMs))[0]!;

  const events = targetBuffStackEvents(encounter.bossId, extracted.targets);
  await prisma.mechanicEvent.createMany({
    data: events.map((event) => ({
      phaseResultId: phaseAt(event.timeMs).id,
      playerResultId: null,
      mechanicName: event.mechanicName,
      category: MechanicCategory.BOSS_SPECIFIC,
      displayName: event.displayName,
      timeMs: event.timeMs,
      context: { ...event.context },
    })),
  });

  console.log(`\n${encounter.recordedAt?.toISOString()} ${permalink}`);
  for (const e of events) {
    console.log(
      `  ${e.mechanicName} #${e.context.ordinal}: max ${e.context.maxStacks} at [${e.context.stackTimesMs.join(", ")}]`,
    );
  }
  for (const player of extracted.players) {
    for (const buff of player.buffUptimesActive ?? []) {
      const name = ELIGIBILITY_BUFF_IDS.get(buff.id);
      if (!name) continue;
      const states = buff.states ?? [];
      const lost = [...states].reverse().find(([, on]) => on === 0)?.[0];
      const heldAtEnd = states.at(-1)?.[1] === 1;
      console.log(
        `  eligibility ${name} ${player.account}: ${heldAtEnd ? "held to the end" : `lost at ${lost}`}`,
      );
    }
  }
}

await prisma.$disconnect();
