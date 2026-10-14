"use client";

import { Card, HoverCard } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { tooltipMechanicIcon } from "@/components/mechanic-icons";
import { DOWNED_MECHANIC_NAME } from "@/lib/mechanics";

// Timeline markers and their hover cards, shared by the batch timeline and the
// single-log timeline so a mechanic's tooltip reads the same on both pages.

export const MARKER_CLUSTER_GAP_MS = 1000;

// When several mechanics share one timeline marker, the most consequential one
// gives the icon and is listed first in the tooltip: a failed Green downs the
// whole squad, so it outranks the downstate that always comes with it.
export const MARKER_PRIORITY = ["F.Green", DOWNED_MECHANIC_NAME];

export function markerRank(mechanicName: string): number {
  const index = MARKER_PRIORITY.indexOf(mechanicName);
  return index === -1 ? MARKER_PRIORITY.length : index;
}

// EI's generic death mechanic — deaths are drawn as their own markers.
export const DEAD_MECHANIC_NAME = "Dead";

export interface PlayerHitCount {
  player: string;
  count: number;
}

export interface MarkerCluster {
  timeMs: number;
  mechanicName: string;
  name: string;
  count: number;
  /** Per-player hit count within this cluster, first-seen order — empty for mechanics with no attributable player (e.g. boss casts). A mechanic that fires more than once per player in the same cluster (e.g. multiple casts hitting the same target) shows up here as count > 1. */
  players: PlayerHitCount[];
  /** Taken from the cluster's first event, like `name`/`timeMs` above — see AttemptRow.mechanics. */
  msSincePhaseEnd?: number;
  /** Taken from the cluster's first event — see AttemptRow.mechanics. */
  msSinceInvisCast?: number;
  /** Summed over the cluster's events, by name — see AttemptRow.mechanics. */
  causes?: { name: string; count: number }[];
}

// Collapses same-mechanic markers that land within MARKER_CLUSTER_GAP_MS of
// each other into one marker (positioned at the earliest one in the group)
// — Spread/Red Bait especially fire once per player and quickly pile up
// into unreadable stacks of overlapping icons at this timeline scale.
// Different mechanics never merge, even at the same timestamp. Player names
// are collected per cluster (not just per event) so the tooltip can show
// who got hit — generic on purpose, so any future per-player mechanic gets
// this for free once it's routed through here.
export function clusterMarkers(
  events: {
    timeMs: number;
    name: string;
    mechanicName: string;
    player?: string | null;
    msSincePhaseEnd?: number;
    msSinceInvisCast?: number;
    causes?: { name: string; count: number }[];
  }[],
): MarkerCluster[] {
  const byMechanic = new Map<string, typeof events>();
  for (const e of events) {
    const list = byMechanic.get(e.mechanicName) ?? [];
    list.push(e);
    byMechanic.set(e.mechanicName, list);
  }

  function pushCluster(clusters: MarkerCluster[], mechanicName: string, group: typeof events) {
    const counts = new Map<string, number>();
    const causes = new Map<string, number>();
    for (const e of group) {
      if (e.player) counts.set(e.player, (counts.get(e.player) ?? 0) + 1);
      for (const cause of e.causes ?? []) {
        causes.set(cause.name, (causes.get(cause.name) ?? 0) + cause.count);
      }
    }
    clusters.push({
      timeMs: group[0]!.timeMs,
      mechanicName,
      name: group[0]!.name,
      count: group.length,
      players: [...counts.entries()].map(([player, count]) => ({ player, count })),
      msSincePhaseEnd: group[0]!.msSincePhaseEnd,
      msSinceInvisCast: group[0]!.msSinceInvisCast,
      causes:
        causes.size > 0
          ? [...causes.entries()].map(([name, count]) => ({ name, count }))
          : undefined,
    });
  }

  const clusters: MarkerCluster[] = [];
  for (const [mechanicName, list] of byMechanic) {
    const sorted = [...list].sort((a, b) => a.timeMs - b.timeMs);
    let current: typeof events = [];
    for (const e of sorted) {
      const last = current.at(-1);
      if (last && e.timeMs - last.timeMs > MARKER_CLUSTER_GAP_MS) {
        pushCluster(clusters, mechanicName, current);
        current = [];
      }
      current.push(e);
    }
    if (current.length > 0) pushCluster(clusters, mechanicName, current);
  }
  return clusters;
}

export interface MechanicMarkerGroup {
  timeMs: number;
  clusters: MarkerCluster[];
}

// clusterMarkers only ever merges same-mechanic markers (different
// mechanics landing at the same instant are a real, distinct thing — e.g. a
// boss hit that auto-applies a debuff a moment later — so they shouldn't
// silently collapse into each other's counts). But rendered as separate,
// fully-overlapping icons, only the topmost one is hoverable — the other(s)
// are inaccessible. This second pass groups *different* mechanics' clusters
// that land within MARKER_CLUSTER_GAP_MS of each other so they can share
// one hoverable marker (see MultiMechanicHoverCard) instead.
export function groupClustersByTime(clusters: MarkerCluster[]): MechanicMarkerGroup[] {
  const sorted = [...clusters].sort((a, b) => a.timeMs - b.timeMs);
  const groups: MechanicMarkerGroup[] = [];
  let current: MarkerCluster[] = [];
  for (const c of sorted) {
    const last = current.at(-1);
    if (last && c.timeMs - last.timeMs > MARKER_CLUSTER_GAP_MS) {
      groups.push({ timeMs: current[0]!.timeMs, clusters: current });
      current = [];
    }
    current.push(c);
  }
  if (current.length > 0) groups.push({ timeMs: current[0]!.timeMs, clusters: current });
  return groups;
}

// Unlike clusterMarkers (time-windowed, for the timeline lanes), this
// collapses every occurrence of a mechanic in a phase into one icon
// regardless of when it happened — the phase-summary cards below show one
// glyph per distinct mechanic, not one per timeline moment.
export function groupFailMechanics(
  events: { mechanicName: string; name: string; player: string | null }[],
): MarkerCluster[] {
  const byMechanic = new Map<
    string,
    { name: string; playerCounts: Map<string, number>; count: number }
  >();
  for (const e of events) {
    const entry = byMechanic.get(e.mechanicName) ?? {
      name: e.name,
      playerCounts: new Map<string, number>(),
      count: 0,
    };
    entry.count += 1;
    if (e.player) entry.playerCounts.set(e.player, (entry.playerCounts.get(e.player) ?? 0) + 1);
    byMechanic.set(e.mechanicName, entry);
  }
  return [...byMechanic.entries()].map(([mechanicName, v]) => ({
    timeMs: 0,
    mechanicName,
    name: v.name,
    count: v.count,
    players: [...v.playerCounts.entries()].map(([player, count]) => ({ player, count })),
  }));
}

// Rich replacement for a native `title` tooltip on a timeline marker: a small
// Card showing which mechanic fired and, in its own row, which players it
// hit — the plain-text `title` couldn't lay those out as separate lines.
// One mechanic's worth of hover-card content (icon/name, its players, and
// any timing sub-fields) — shared by MechanicHoverCard (one mechanic) and
// MultiMechanicHoverCard (several, one section each) below.
function MechanicSummary({ cluster, icon }: Readonly<{ cluster: MarkerCluster; icon: ReactNode }>) {
  const t = useTranslations("batchAttempts.timeline");
  return (
    <>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-foreground-strong text-xs font-semibold">{cluster.name}</span>
      </div>
      {cluster.players.length > 0 ? (
        <div className="mt-1.5">
          <div className="text-muted text-[10px] font-semibold uppercase tracking-wide">
            {t("players", { count: cluster.players.length })}
          </div>
          <div className="text-foreground mt-0.5 text-[11px]">
            {cluster.players
              .map((p) => (p.count > 1 ? `${p.player} ×${p.count}` : p.player))
              .join(", ")}
          </div>
        </div>
      ) : null}
      {cluster.causes ? (
        <div className="mt-1.5">
          <div className="text-muted text-[10px] font-semibold uppercase tracking-wide">
            {t("causes")}
          </div>
          <div className="text-foreground mt-0.5 text-[11px]">
            {cluster.causes.map((c) => (c.count > 1 ? `${c.name} ×${c.count}` : c.name)).join(", ")}
          </div>
        </div>
      ) : null}
      {cluster.msSincePhaseEnd !== undefined ? (
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="text-foreground text-[11px] font-semibold">
            {(cluster.msSincePhaseEnd / 1000).toFixed(1)}s
          </span>
          <span className="text-muted-strong text-[10px]">{t("sincePhaseEnd")}</span>
        </div>
      ) : null}
      {cluster.msSinceInvisCast !== undefined ? (
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-foreground text-[11px] font-semibold">
            {(cluster.msSinceInvisCast / 1000).toFixed(1)}s
          </span>
          <span className="text-muted-strong text-[10px]">{t("sinceInvisCastEnd")}</span>
        </div>
      ) : null}
    </>
  );
}

export function MechanicHoverCard({
  cluster,
  icon,
  children,
}: Readonly<{ cluster: MarkerCluster; icon: ReactNode; children: ReactNode }>) {
  return (
    <HoverCard.Root openDelay={150} closeDelay={80}>
      <HoverCard.Trigger>{children}</HoverCard.Trigger>
      <HoverCard.Content size="1" sideOffset={6} className="!border-none !bg-transparent !p-0">
        <Card size="1" className="border-line bg-surface-2 min-w-[170px] border shadow-lg">
          <MechanicSummary cluster={cluster} icon={icon} />
        </Card>
      </HoverCard.Content>
    </HoverCard.Root>
  );
}

// Same trigger/positioning as MechanicHoverCard, but for a group of
// *different* mechanics that landed within MARKER_CLUSTER_GAP_MS of each
// other (see groupClustersByTime) and now share one marker. Each mechanic
// gets its own bordered, lighter-toned box (bg-surface against the popover's
// bg-surface-2) instead of a thin divider — a divider read the same as the
// one MechanicSummary already draws between a mechanic's title and its own
// player list, so entry-vs-entry and title-vs-players were easy to confuse;
// boxing each entry makes the two kinds of grouping visually distinct.
export function MultiMechanicHoverCard({
  clusters,
  children,
}: Readonly<{ clusters: MarkerCluster[]; children: ReactNode }>) {
  return (
    <HoverCard.Root openDelay={150} closeDelay={80}>
      <HoverCard.Trigger>{children}</HoverCard.Trigger>
      <HoverCard.Content size="1" sideOffset={6} className="!border-none !bg-transparent !p-0">
        <Card size="1" className="border-line bg-surface-2 min-w-[170px] border !p-1 shadow-lg">
          <div className="flex flex-col gap-1">
            {clusters.map((cluster) => (
              <div
                key={`${cluster.mechanicName}-${cluster.timeMs}`}
                className="border-line bg-surface rounded-sm border px-3 py-2.5"
              >
                <MechanicSummary
                  cluster={cluster}
                  icon={tooltipMechanicIcon(cluster.mechanicName)}
                />
              </div>
            ))}
          </div>
        </Card>
      </HoverCard.Content>
    </HoverCard.Root>
  );
}
