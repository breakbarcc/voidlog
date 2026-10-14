"use client";

import { Cross2Icon } from "@radix-ui/react-icons";
import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  clusterMarkers,
  DEAD_MECHANIC_NAME,
  groupClustersByTime,
  MARKER_PRIORITY,
  markerRank,
  MechanicHoverCard,
  MultiMechanicHoverCard,
} from "@/components/mechanic-hover-card";
import {
  AttackGlyph,
  attackType,
  failMechanicIcon,
  HIGH_FREQUENCY_ATTACK_TYPES,
} from "@/components/mechanic-icons";
import { phaseColor } from "@/components/phase-badge";
import type { Locale } from "@/i18n/locale";
import type { AttemptTimelineData } from "@/lib/attempt-timeline";
import { isVisibleCastMarker } from "@/lib/mechanics";
import { formatPercent } from "@/lib/utils";

/**
 * One attempt's timeline: boss attacks in two lanes above the phase bar, fails
 * and deaths below it. Shared by the batch page's attempt list and the
 * single-log page so a log looks the same on both.
 */
export function AttemptTimeline({
  data,
  hiddenMechanics,
  selectedPlayer = null,
  bossHealthPercent = null,
  furthestPhaseOrder,
  className = "",
  style,
}: Readonly<{
  data: AttemptTimelineData;
  /** Mechanics (raw names) to leave out, e.g. via the batch page's filter. */
  hiddenMechanics?: ReadonlySet<string>;
  /** Character name: only that player's fails are drawn (boss casts stay). */
  selectedPlayer?: string | null;
  /** Boss health left, shown in the tooltip of the segment the attempt ended in. */
  bossHealthPercent?: number | null;
  furthestPhaseOrder?: number;
  className?: string;
  style?: CSSProperties;
}>) {
  const tTimeline = useTranslations("batchAttempts.timeline");
  const locale = useLocale() as Locale;
  const a = data;

  const visibleMechanics = a.mechanics.filter((m) => !hiddenMechanics?.has(m.mechanicName));
  const highFreqClusters = clusterMarkers(
    visibleMechanics.filter((m) => {
      const type = attackType(m.mechanicName);
      return type && HIGH_FREQUENCY_ATTACK_TYPES.has(type);
    }),
  );
  const attackClusters = clusterMarkers(
    visibleMechanics.filter((m) => {
      const type = attackType(m.mechanicName);
      return type && !HIGH_FREQUENCY_ATTACK_TYPES.has(type);
    }),
  );
  const beamClusters = attackClusters.filter((c) => c.mechanicName === "Beam.Cast");
  // Boss-attack lanes above stay unfiltered by selectedPlayer — a cast isn't
  // an attributable mistake, only a fail is.
  const failClusters = clusterMarkers(
    visibleMechanics.filter(
      (m) =>
        !isVisibleCastMarker(a.bossId, m.mechanicName) &&
        (selectedPlayer === null || m.player === selectedPlayer),
    ),
  );
  // Different mechanics landing at nearly the same moment (e.g. a boss hit
  // that auto-applies a debuff right after) would otherwise render as
  // fully-overlapping icons with only the topmost hoverable — group them
  // under one marker instead.
  const failGroups = groupClustersByTime(failClusters);

  return (
    <span className={`flex flex-col gap-0.5 ${className}`} style={style}>
      {/* Lane 0: Greens/baits fire far more often than the named boss casts
          and were crowding that lane — their own row above it. Markers of the
          same mechanic close together collapse into one (tooltip shows the
          count). */}
      <span className="relative h-4 w-full">
        {highFreqClusters.map((c) => {
          const type = attackType(c.mechanicName)!;
          return (
            <MechanicHoverCard
              key={`${c.mechanicName}-${c.timeMs}`}
              cluster={c}
              icon={<AttackGlyph type={type} />}
            >
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(c.timeMs / a.durationMs) * 100}%` }}
              >
                <AttackGlyph type={type} />
              </span>
            </MechanicHoverCard>
          );
        })}
      </span>
      {/* Lane 1: boss attacks — same icon size as the fail lane below,
          positioned above the bar so the category reads from position alone. */}
      <span className="relative h-4 w-full">
        {attackClusters.map((c) => {
          const type = attackType(c.mechanicName)!;
          const flipped =
            c.mechanicName === "Beam.Cast" ? beamClusters.indexOf(c) % 2 === 1 : undefined;
          return (
            <MechanicHoverCard
              key={`${c.mechanicName}-${c.timeMs}`}
              cluster={c}
              icon={<AttackGlyph type={type} flipped={flipped} />}
            >
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(c.timeMs / a.durationMs) * 100}%` }}
              >
                <AttackGlyph type={type} flipped={flipped} />
              </span>
            </MechanicHoverCard>
          );
        })}
      </span>
      {/* Lane 2: phase-color bar */}
      <span className="bg-line-soft relative h-2 w-full rounded-sm">
        {a.segments.map((seg) => (
          <span
            key={seg.order}
            title={
              bossHealthPercent !== null && seg.order === furthestPhaseOrder
                ? `${seg.name} · ${formatPercent(bossHealthPercent, locale)}`
                : seg.name
            }
            className="absolute top-0 h-2 rounded-[1px]"
            style={{
              left: `${seg.leftPct}%`,
              width: `${seg.widthPct}%`,
              background: phaseColor(a.bossId, seg.order, seg.name),
            }}
          />
        ))}
      </span>
      {/* Lane 3: fails/deaths — icon size matched to the attack lane. */}
      <span className="relative h-4 w-full">
        {a.deaths.map((d) => (
          <MechanicHoverCard
            key={`${d.timeMs}-${d.player ?? ""}`}
            cluster={{
              timeMs: d.timeMs,
              mechanicName: DEAD_MECHANIC_NAME,
              name: tTimeline("death"),
              count: 1,
              players: d.player ? [{ player: d.player, count: 1 }] : [],
            }}
            icon={<Cross2Icon className="text-danger h-3.5 w-3.5" />}
          >
            <span
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(d.timeMs / a.durationMs) * 100}%` }}
            >
              <Cross2Icon className="text-danger h-3.5 w-3.5" />
            </span>
          </MechanicHoverCard>
        ))}
        {failGroups.map((group) => {
          const first = group.clusters[0]!;
          // Priority mechanics (failed Green, downstate) win the icon and lead
          // the tooltip; ties keep the time order.
          const clusters = [...group.clusters].sort(
            (x, y) => markerRank(x.mechanicName) - markerRank(y.mechanicName),
          );
          const representative = clusters[0]!;
          return (
            <MultiMechanicHoverCard
              key={`${first.mechanicName}-${group.timeMs}`}
              clusters={clusters}
            >
              <span
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                  markerRank(representative.mechanicName) < MARKER_PRIORITY.length ? "z-20" : "z-10"
                }`}
                style={{ left: `${(group.timeMs / a.durationMs) * 100}%` }}
              >
                {failMechanicIcon(representative.mechanicName)}
              </span>
            </MultiMechanicHoverCard>
          );
        })}
      </span>
    </span>
  );
}
