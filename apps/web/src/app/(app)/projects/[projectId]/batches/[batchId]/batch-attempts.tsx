"use client";

import { CheckCircledIcon, ChevronRightIcon, Cross2Icon } from "@radix-ui/react-icons";
import { Card, HoverCard, Select, Tabs, Table } from "@radix-ui/themes";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AttackGlyph,
  attackType,
  failMechanicIcon,
  HIGH_FREQUENCY_ATTACK_TYPES,
  tooltipMechanicIcon,
  type AttackType,
} from "@/components/mechanic-icons";
import {
  MARKER_CLUSTER_GAP_MS,
  MARKER_PRIORITY,
  markerRank,
  DEAD_MECHANIC_NAME,
  clusterMarkers,
  groupClustersByTime,
  groupFailMechanics,
  MechanicHoverCard,
  MultiMechanicHoverCard,
} from "@/components/mechanic-hover-card";
import { AttemptTimeline } from "@/components/attempt-timeline";
import { PhaseBadge, phaseColor, readableHeadingColor } from "@/components/phase-badge";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import type { Locale } from "@/i18n/locale";
import { DOWNED_MECHANIC_NAME, isVisibleCastMarker } from "@/lib/mechanics";
import { formatDateTime, formatPercent } from "@/lib/utils";
import {
  PhaseProgressChart,
  type PhaseProgressStat,
  type PreviousPhaseProgress,
} from "./phase-progress-chart";
import { RemoveLogButton } from "./remove-log-button";

export interface AttemptRow {
  logFileId: string;
  fileName: string;
  bossId: string;
  isCM: boolean;
  n: number;
  success: boolean;
  /** Health the last enemy had left on a wipe, 0-100; null for kills and logs without it. */
  bossHealthPercent: number | null;
  furthestPhase: { name: string; order: number } | null;
  durationMs: number;
  /** When the attempt actually happened in-game — falls back to when the log row was persisted, see page.tsx. */
  recordedAt: Date;
  segments: { name: string; order: number; leftPct: number; widthPct: number }[];
  deaths: { timeMs: number; player: string | null }[];
  mechanics: {
    timeMs: number;
    name: string;
    mechanicName: string;
    player: string | null;
    /** Only populated for stealth-phase events (see stealth-phases.ts on the worker) — currently just "Invis.Cast". */
    msSincePhaseEnd?: number;
    /** Only populated on "Revealed" events — time since the causing Mass-Invisibility cast's channel ended, not the phase end. */
    msSinceInvisCast?: number;
    /** Only populated on downstates: unavoidable mechanics that hit the player just before — see BossCuration.downCauses. */
    causes?: { name: string; count: number }[];
  }[];
  phases: {
    name: string;
    order: number;
    reached: boolean;
    success: boolean;
    durationMs: number;
    mechanics: { mechanicName: string; name: string; player: string | null }[];
  }[];
}

export interface BatchPhaseStat {
  name: string;
  order: number;
  reached: number;
  total: number;
  mechanics: { mechanicName: string; displayName: string; count: number }[];
}

export interface BatchRosterRow {
  account: string;
  characterNames: string;
  role: string;
  encounters: number;
  kills: number;
  avgDps: number;
  avgDowns: string;
  failedMechanics: number;
  /** Shockwaves the player was alive for — the denominator of the hit share. */
  shockwavesPlayed: number;
  /** Of those, the ones that hit the player. */
  shockwavesHit: number;
  debilitatedHits: number;
  revealCount: number;
  /** Stealth windows the player was in — the denominator of the reveal share. */
  stealthWindows: number;
  /** Attempts that reached Primordus's attacks — the denominator of the chomp share. */
  chompAttempts: number;
  /** Of those, the ones in which the player got chomped (Slam or Jaws). */
  chompedAttempts: number;
}

type RosterSortKey =
  | "account"
  | "role"
  | "encounters"
  | "kills"
  | "avgDps"
  | "avgDowns"
  | "failedMechanics"
  | "shockwaves"
  | "debilitatedHits"
  | "revealCount"
  | "chomps";

// Same convention as the project-wide roster table (roster-table.tsx): text
// columns default ascending, numeric performance stats default descending
// (highest first) — matches this table's original server-side default sort
// (most failed mechanics first).
const ROSTER_DEFAULT_DIRECTION: Record<RosterSortKey, "asc" | "desc"> = {
  account: "asc",
  role: "asc",
  encounters: "desc",
  kills: "desc",
  avgDps: "desc",
  avgDowns: "desc",
  failedMechanics: "desc",
  shockwaves: "desc",
  debilitatedHits: "desc",
  revealCount: "desc",
  chomps: "desc",
};

// Share of the shockwaves the player played that hit them; null when they
// played none (sorts below 0%).
function shockwaveShare(row: BatchRosterRow): number | null {
  if (row.shockwavesPlayed === 0) return null;
  return row.shockwavesHit / row.shockwavesPlayed;
}

// Share of the attempts reaching Primordus's attacks in which the player got
// chomped; null when they reached none (sorts below 0%).
function chompShare(row: BatchRosterRow): number | null {
  if (row.chompAttempts === 0) return null;
  return row.chompedAttempts / row.chompAttempts;
}

// Share of the stealth windows in which the player got revealed too early;
// null when they were in none (sorts below 0%).
function revealShare(row: BatchRosterRow): number | null {
  if (row.stealthWindows === 0) return null;
  return row.revealCount / row.stealthWindows;
}

function compareRosterRows(a: BatchRosterRow, b: BatchRosterRow, key: RosterSortKey): number {
  switch (key) {
    case "account":
      return a.account.localeCompare(b.account);
    case "role":
      return a.role.localeCompare(b.role);
    case "encounters":
      return a.encounters - b.encounters;
    case "kills":
      return a.kills - b.kills;
    case "avgDps":
      return a.avgDps - b.avgDps;
    case "avgDowns":
      return Number.parseFloat(a.avgDowns) - Number.parseFloat(b.avgDowns);
    case "failedMechanics":
      return a.failedMechanics - b.failedMechanics;
    case "shockwaves":
      return (shockwaveShare(a) ?? -1) - (shockwaveShare(b) ?? -1);
    case "debilitatedHits":
      return a.debilitatedHits - b.debilitatedHits;
    case "revealCount":
      return (revealShare(a) ?? -1) - (revealShare(b) ?? -1);
    case "chomps":
      return (chompShare(a) ?? -1) - (chompShare(b) ?? -1);
  }
}

// File names look like "20260712-204218.zevtc"; the digits after the dash are
// the recording time, which is how players tell their logs apart.
function logSuffix(fileName: string): string {
  return /-(\d+)\.[^.]+$/.exec(fileName)?.[1] ?? "–";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

// One label/value pair in an attempt's stat overview row (result, mode,
// duration, ...) — plain text, unlike the icon-only mechanic cards below it.
function StatItem({
  label,
  value,
  valueClassName,
}: Readonly<{ label: string; value: ReactNode; valueClassName?: string }>) {
  return (
    <div>
      <div className="text-muted text-[10px] uppercase tracking-wide">{label}</div>
      <div className={`text-xs font-semibold ${valueClassName ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

// Normal Mode and Challenge Mode share the same bossId (see EncounterResult
// .isCM) — this is the only visual signal that an attempt was accidentally
// uploaded in the wrong mode.
function ModeBadge({ isCM }: Readonly<{ isCM: boolean }>) {
  return (
    <span
      className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${
        isCM ? "bg-primary/15 text-primary" : "bg-line-soft text-muted-strong"
      }`}
    >
      {isCM ? "CM" : "NM"}
    </span>
  );
}

interface PhaseFilterGroup {
  name: string;
  order: number;
  attacks: [string, AttackType][];
  fails: [string, string][];
}

interface PhaseMechanicGroup {
  order: number;
  attacks: Map<string, AttackType>;
  fails: Map<string, string>;
}

// Sorts one phase's mechanics into its group's attacks/fails maps and records
// which phases each mechanic appeared in — split out of buildPhaseMechanicMaps
// below purely to keep nesting (and therefore cognitive complexity) low in any
// single function; a triple-nested loop with branches inside all counts
// against the same function otherwise.
function collectPhaseMechanics(
  phase: AttemptRow["phases"][number],
  group: PhaseMechanicGroup,
  phasesByMechanic: Map<string, Set<string>>,
  attackTypeByMechanic: Map<string, AttackType>,
  failLabelByMechanic: Map<string, string>,
) {
  for (const m of phase.mechanics) {
    if (GLOBAL_MECHANIC_NAMES.has(m.mechanicName)) continue;
    const type = attackType(m.mechanicName);
    if (type) {
      if (!group.attacks.has(m.mechanicName)) group.attacks.set(m.mechanicName, type);
      attackTypeByMechanic.set(m.mechanicName, type);
    } else {
      if (!group.fails.has(m.mechanicName)) group.fails.set(m.mechanicName, m.name);
      failLabelByMechanic.set(m.mechanicName, m.name);
    }
    const phases = phasesByMechanic.get(m.mechanicName) ?? new Set<string>();
    phases.add(phase.name);
    phasesByMechanic.set(m.mechanicName, phases);
  }
}

function buildPhaseMechanicMaps(attempts: AttemptRow[]) {
  const groups = new Map<string, PhaseMechanicGroup>();
  const phasesByMechanic = new Map<string, Set<string>>();
  const attackTypeByMechanic = new Map<string, AttackType>();
  const failLabelByMechanic = new Map<string, string>();

  for (const a of attempts) {
    for (const phase of a.phases) {
      const group = groups.get(phase.name) ?? {
        order: phase.order,
        attacks: new Map<string, AttackType>(),
        fails: new Map<string, string>(),
      };
      group.order = Math.min(group.order, phase.order);
      collectPhaseMechanics(
        phase,
        group,
        phasesByMechanic,
        attackTypeByMechanic,
        failLabelByMechanic,
      );
      groups.set(phase.name, group);
    }
  }

  return { groups, phasesByMechanic, attackTypeByMechanic, failLabelByMechanic };
}

// Mechanics whose HTCM design spans multiple dragon phases (per
// harvest-temple.ts: Greens spawns on Jormag/Primordus/Zhaitan, the
// Mass-Invisibility stealth phase and its "Revealed" fail after
// Jormag/Primordus/Mordremoth — see stealth-phases.ts on the worker) but
// that this specific batch's attempts happened to only reach/fail on one of
// them — without this, a batch with e.g. only Jormag data would show
// "Greens verfehlt"/"Mass Invisibility"/"Revealed" filed under Jormag
// instead of "Mehrere Phasen", which would look wrong the moment a
// Primordus/Mordremoth/Zhaitan attempt is added later. Forced in regardless
// of what phasesByMechanic below actually observed.
const FORCE_MULTI_PHASE_MECHANIC_NAMES = new Set([
  "F.Green",
  "Green.Spawn",
  "Invis.Cast",
  "Revealed",
]);

// Mechanics that show up in more than one main phase (e.g. a fail that can
// happen throughout the fight, not tied to one phase) go into their own
// "Mehrere Phasen" group instead of being listed once per phase.
function buildPhaseFilterData(attempts: AttemptRow[]) {
  const { groups, phasesByMechanic, attackTypeByMechanic, failLabelByMechanic } =
    buildPhaseMechanicMaps(attempts);

  const multiPhaseNames = new Set(
    [...phasesByMechanic.entries()].filter(([, phases]) => phases.size > 1).map(([name]) => name),
  );
  for (const name of FORCE_MULTI_PHASE_MECHANIC_NAMES) {
    if (phasesByMechanic.has(name)) multiPhaseNames.add(name);
  }

  const phaseFilterGroups: PhaseFilterGroup[] = [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, g]) => ({
      name,
      order: g.order,
      attacks: [...g.attacks.entries()].filter(([mn]) => !multiPhaseNames.has(mn)),
      fails: [...g.fails.entries()]
        .filter(([mn]) => !multiPhaseNames.has(mn))
        .sort((a, b) => a[1].localeCompare(b[1])),
    }));

  const multiPhaseAttacks = [...multiPhaseNames]
    .filter((mn) => attackTypeByMechanic.has(mn))
    .map((mn) => [mn, attackTypeByMechanic.get(mn)!] as [string, AttackType]);

  const multiPhaseFails = [...multiPhaseNames]
    .filter((mn) => failLabelByMechanic.has(mn))
    .map((mn) => [mn, failLabelByMechanic.get(mn)!] as [string, string])
    .sort((a, b) => a[1].localeCompare(b[1]));

  return { phaseFilterGroups, multiPhaseAttacks, multiPhaseFails };
}

// Mechanics that can happen in any phase (not tied to boss mechanics) — kept
// out of the per-phase groups so they don't get listed once per phase, and
// shown once under "Other" instead. Keys only — labels are locale-dependent
// (see messages/*.json's `globalMechanicLabels`), looked up where rendered.
const GLOBAL_MECHANIC_NAMES = new Set(["Downed", "DC"]);

// One toggle chip for a single mechanic — clicking it hides that mechanic's
// markers from every attempt row below (keyed by the raw mechanicName, so it
// works for any boss, not just the hardcoded HTCM attack glyphs).
function MechanicToggle({
  mechanicName,
  label,
  icon,
  isHidden,
  onToggle,
}: Readonly<{
  mechanicName: string;
  label: string;
  icon: ReactNode;
  isHidden: boolean;
  onToggle: (mechanicName: string) => void;
}>) {
  const t = useTranslations("batchAttempts.timeline");
  return (
    <button
      type="button"
      onClick={() => onToggle(mechanicName)}
      title={isHidden ? t("showMarker") : t("hideMarker")}
      className={`flex items-center gap-1.5 text-xs ${
        isHidden ? "text-muted opacity-45" : "text-muted-strong"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Collapsible, phase-grouped filter for the "Versuchsverlauf" timeline —
// collapsed by default since it's a secondary control, not something every
// visitor needs. Grouping by phase (instead of one flat list) mirrors the
// aggregate phase cards above it, so the same phase names/colors orient the
// user here too.

// One filter-table cell's worth of toggle chips — used for both the
// "Boss-Angriffe" and "Mechaniken" columns. An em-dash placeholder keeps
// empty cells from collapsing to nothing, so every row's two columns stay
// visually aligned like a pricing table's feature grid.
function MechanicCell({ children, empty }: Readonly<{ children: ReactNode; empty: boolean }>) {
  return (
    <Table.Cell className="border-line-soft border-l">
      {empty ? (
        <span className="text-muted text-xs">—</span>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">{children}</div>
      )}
    </Table.Cell>
  );
}

// Sentinel for Select.Item's value (Radix disallows an empty-string value) —
// stands in for "no player selected", mapped back to `null` at the callback.
const ALL_PLAYERS_VALUE = "__all__";

function MechanicFilterAccordion({
  bossId,
  phaseGroups,
  multiPhaseAttacks,
  multiPhaseFails,
  otherEntries,
  hidden,
  onToggle,
  onSelectAll,
  onDeselectAll,
  playerNames,
  selectedPlayer,
  onSelectPlayer,
}: Readonly<{
  bossId: string;
  phaseGroups: PhaseFilterGroup[];
  multiPhaseAttacks: [string, AttackType][];
  multiPhaseFails: [string, string][];
  otherEntries: [string, string][];
  hidden: Set<string>;
  onToggle: (mechanicName: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  playerNames: string[];
  selectedPlayer: string | null;
  onSelectPlayer: (player: string | null) => void;
}>) {
  const t = useTranslations("batchAttempts.timeline");
  const tAttack = useTranslations("attackLabels");
  return (
    <details className="border-line-soft group mb-3.5 border-b pb-3.5">
      <summary className="text-muted-strong flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-semibold">
        <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        {t("mechanicFilter")}
      </summary>
      <div className="mt-3 hidden flex-col gap-3 group-open:flex">
        {/* Restricts the "Mechaniken"/fail markers below to one player's own
            fails (boss-attack markers stay unfiltered — those aren't
            attributable mistakes) — separate axis from the mechanic-type
            toggles below, the two combine rather than replace each other. */}
        <div className="flex items-center gap-2.5">
          <span className="text-muted-strong text-xs font-semibold">{t("player")}</span>
          <Select.Root
            value={selectedPlayer ?? ALL_PLAYERS_VALUE}
            onValueChange={(value) => onSelectPlayer(value === ALL_PLAYERS_VALUE ? null : value)}
          >
            <Select.Trigger variant="surface" className="min-w-[160px]" />
            <Select.Content>
              <Select.Item value={ALL_PLAYERS_VALUE}>{t("allPlayers")}</Select.Item>
              {playerNames.map((name) => (
                <Select.Item key={name} value={name}>
                  {name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
        <Table.Root variant="surface" className="border-line bg-surface-2 border">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>{t("phase")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell className="border-line-soft border-l">
                {t("bossAttacks")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell className="border-line-soft border-l">
                <div className="flex items-center justify-between gap-3">
                  <span>{t("mechanics")}</span>
                  {/* These only ever touch the Mechaniken column's toggles
                      (see selectAllMechanics/deselectAllMechanics) — living
                      in this header cell instead of a separate row makes
                      that scope visually obvious. */}
                  <span className="flex items-center gap-2.5 normal-case">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onDeselectAll();
                      }}
                      className="text-accent text-[11px] font-semibold hover:underline"
                    >
                      {t("showAll")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectAll();
                      }}
                      className="text-accent text-[11px] font-semibold hover:underline"
                    >
                      {t("hideAll")}
                    </button>
                  </span>
                </div>
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {phaseGroups.map((group) => (
              <Table.Row key={group.name}>
                <Table.Cell>
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color: readableHeadingColor(phaseColor(bossId, group.order, group.name)),
                    }}
                  >
                    {group.name}
                  </span>
                </Table.Cell>
                <MechanicCell empty={group.attacks.length === 0}>
                  {group.attacks.map(([mechanicName, type]) => (
                    <MechanicToggle
                      key={mechanicName}
                      mechanicName={mechanicName}
                      label={tAttack(type)}
                      icon={<AttackGlyph type={type} />}
                      isHidden={hidden.has(mechanicName)}
                      onToggle={onToggle}
                    />
                  ))}
                </MechanicCell>
                <MechanicCell empty={group.fails.length === 0}>
                  {group.fails.map(([mechanicName, label]) => (
                    <MechanicToggle
                      key={mechanicName}
                      mechanicName={mechanicName}
                      label={label}
                      icon={failMechanicIcon(mechanicName)}
                      isHidden={hidden.has(mechanicName)}
                      onToggle={onToggle}
                    />
                  ))}
                </MechanicCell>
              </Table.Row>
            ))}
            {multiPhaseAttacks.length > 0 || multiPhaseFails.length > 0 ? (
              <Table.Row>
                <Table.Cell>
                  <span className="text-muted-strong text-xs font-semibold uppercase tracking-wide">
                    {t("multiplePhases")}
                  </span>
                </Table.Cell>
                <MechanicCell empty={multiPhaseAttacks.length === 0}>
                  {multiPhaseAttacks.map(([mechanicName, type]) => (
                    <MechanicToggle
                      key={mechanicName}
                      mechanicName={mechanicName}
                      label={tAttack(type)}
                      icon={<AttackGlyph type={type} />}
                      isHidden={hidden.has(mechanicName)}
                      onToggle={onToggle}
                    />
                  ))}
                </MechanicCell>
                <MechanicCell empty={multiPhaseFails.length === 0}>
                  {multiPhaseFails.map(([mechanicName, label]) => (
                    <MechanicToggle
                      key={mechanicName}
                      mechanicName={mechanicName}
                      label={label}
                      icon={failMechanicIcon(mechanicName)}
                      isHidden={hidden.has(mechanicName)}
                      onToggle={onToggle}
                    />
                  ))}
                </MechanicCell>
              </Table.Row>
            ) : null}
            <Table.Row>
              <Table.Cell>
                <span className="text-muted-strong text-xs font-semibold uppercase tracking-wide">
                  {t("other")}
                </span>
              </Table.Cell>
              <MechanicCell empty>{null}</MechanicCell>
              <Table.Cell className="border-line-soft border-l">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-muted-strong flex items-center gap-1.5 text-xs">
                    <Cross2Icon className="text-danger h-3.5 w-3.5" />
                    {t("death")}
                  </span>
                  {otherEntries.map(([mechanicName, label]) => (
                    <MechanicToggle
                      key={mechanicName}
                      mechanicName={mechanicName}
                      label={label}
                      icon={failMechanicIcon(mechanicName)}
                      isHidden={hidden.has(mechanicName)}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </div>
    </details>
  );
}

export function BatchAttempts({
  projectId,
  batchId,
  bossId,
  attempts,
  batchPhaseStats,
  phaseProgress,
  wipesByPhase,
  previousProgress,
  roster,
  canEdit,
}: Readonly<{
  projectId: string;
  batchId: string;
  /** Contributors and admins may delete logs; viewers only read. */
  canEdit: boolean;
  bossId: string;
  attempts: AttemptRow[];
  batchPhaseStats: BatchPhaseStat[];
  phaseProgress: PhaseProgressStat[];
  wipesByPhase: Record<string, number>;
  previousProgress: PreviousPhaseProgress | null;
  roster: BatchRosterRow[];
}>) {
  const t = useTranslations("batchAttempts");
  const tTimeline = useTranslations("batchAttempts.timeline");
  const tGlobalMechanics = useTranslations("globalMechanicLabels");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [expanded, setExpanded] = useState<number | null>(null);
  const [hiddenMechanics, setHiddenMechanics] = useState<Set<string>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const maxDurationMs = Math.max(1, ...attempts.map((a) => a.durationMs));

  // Every character name in the batch's roster, regardless of whether they
  // ever failed a mechanic — lets the filter pick a player who's had zero
  // fails and correctly see an empty timeline, not just the ones who show up
  // in a marker already.
  const playerNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of roster) {
      for (const name of entry.characterNames.split(",")) {
        const trimmed = name.trim();
        if (trimmed) names.add(trimmed);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [roster]);

  const [rosterSortKey, setRosterSortKey] = useState<RosterSortKey>("failedMechanics");
  const [rosterDirection, setRosterDirection] = useState<"asc" | "desc">("desc");

  function handleRosterSort(key: RosterSortKey) {
    if (key === rosterSortKey) {
      setRosterDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setRosterSortKey(key);
      setRosterDirection(ROSTER_DEFAULT_DIRECTION[key]);
    }
  }

  const sortedRoster = useMemo(() => {
    const rows = [...roster].sort((a, b) => compareRosterRows(a, b, rosterSortKey));
    return rosterDirection === "asc" ? rows : rows.reverse();
  }, [roster, rosterSortKey, rosterDirection]);

  function rosterHeader(key: RosterSortKey, label: string, hint?: string) {
    return (
      <SortableColumnHeader
        active={rosterSortKey === key}
        direction={rosterDirection}
        onClick={() => handleRosterSort(key)}
      >
        {hint ? (
          <span>
            {label}
            <span className="text-muted block text-xs font-normal">{hint}</span>
          </span>
        ) : (
          label
        )}
      </SortableColumnHeader>
    );
  }

  function toggleMechanic(mechanicName: string) {
    setHiddenMechanics((prev) => {
      const next = new Set(prev);
      if (next.has(mechanicName)) {
        next.delete(mechanicName);
      } else {
        next.add(mechanicName);
      }
      return next;
    });
  }

  // Every fail-mechanic name that can show up anywhere in the filter
  // accordion (phase groups, "Mehrere Phasen", "Weitere") — all three
  // sections are built from this same underlying data, so collecting it
  // once here covers all of them for the select-all/deselect-all controls.
  // Boss-attack markers (attackType() recognizes them) are excluded: those
  // have their own "Boss-Angriffe" sub-row per phase group now and aren't
  // meant to be toggled in bulk by these two buttons.
  const allFailMechanicNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of attempts) {
      for (const phase of a.phases) {
        for (const m of phase.mechanics) {
          if (attackType(m.mechanicName)) continue;
          names.add(m.mechanicName);
        }
      }
    }
    return names;
  }, [attempts]);

  function selectAllMechanics() {
    setHiddenMechanics((prev) => {
      const next = new Set(prev);
      for (const name of allFailMechanicNames) next.add(name);
      return next;
    });
  }

  function deselectAllMechanics() {
    setHiddenMechanics((prev) => {
      const next = new Set(prev);
      for (const name of allFailMechanicNames) next.delete(name);
      return next;
    });
  }

  // Distinct mechanics actually present per main phase, used to build the
  // phase-grouped filter accordion — boss-agnostic (attack glyphs only show
  // up if attackType() recognizes the mechanicName, which today means HTCM;
  // any other boss just gets fail-mechanic groups).
  const otherMechanicEntries = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attempts) {
      for (const phase of a.phases) {
        for (const m of phase.mechanics) {
          if (GLOBAL_MECHANIC_NAMES.has(m.mechanicName) && !map.has(m.mechanicName)) {
            map.set(m.mechanicName, tGlobalMechanics(m.mechanicName));
          }
        }
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [attempts, tGlobalMechanics]);

  const { phaseFilterGroups, multiPhaseAttacks, multiPhaseFails } = useMemo(
    () => buildPhaseFilterData(attempts),
    [attempts],
  );

  return (
    <Tabs.Root defaultValue="table">
      <Tabs.List>
        <Tabs.Trigger value="table">{t("tabs.table")}</Tabs.Trigger>
        <Tabs.Trigger value="timeline">{t("tabs.timeline")}</Tabs.Trigger>
        <Tabs.Trigger value="roster">{t("tabs.roster")}</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="table" className="mt-4">
        {phaseProgress.length > 0 ? (
          <PhaseProgressChart
            bossId={bossId}
            stats={phaseProgress}
            wipesByPhase={wipesByPhase}
            attempts={attempts.length}
            previous={previousProgress}
          />
        ) : null}
        <Table.Root variant="surface" className="border-line bg-surface border">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>{t("table.number")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{t("table.time")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{t("table.logId")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{t("table.result")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{t("table.mode")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{t("table.furthestPhase")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{t("table.duration")}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {attempts.map((a) => (
              <Table.Row key={a.logFileId}>
                <Table.Cell className="text-muted">{a.n}</Table.Cell>
                <Table.Cell className="text-muted-strong tabular-nums">
                  {formatDateTime(a.recordedAt, locale, { timeStyle: "short" })}
                </Table.Cell>
                <Table.Cell className="text-muted-strong tabular-nums">
                  {logSuffix(a.fileName)}
                </Table.Cell>
                <Table.Cell
                  className={a.success ? "text-success font-semibold" : "text-danger font-semibold"}
                >
                  {a.success ? tCommon("kill") : tCommon("wipe")}
                </Table.Cell>
                <Table.Cell>
                  <ModeBadge isCM={a.isCM} />
                </Table.Cell>
                <Table.Cell>
                  {a.furthestPhase ? (
                    <span className="inline-flex items-center gap-2">
                      <PhaseBadge
                        bossId={a.bossId}
                        name={a.furthestPhase.name}
                        order={a.furthestPhase.order}
                      />
                      {a.bossHealthPercent !== null ? (
                        <span className="text-muted-strong text-xs">
                          {formatPercent(a.bossHealthPercent, locale)}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    tCommon("dash")
                  )}
                </Table.Cell>
                <Table.Cell className="text-muted-strong">
                  {formatDuration(a.durationMs)}
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Link
                    href={`/projects/${projectId}/batches/${batchId}/logs/${a.logFileId}`}
                    className="text-accent text-sm hover:underline"
                  >
                    {t("table.viewLog")}
                  </Link>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {canEdit ? (
                    <RemoveLogButton
                      logFileId={a.logFileId}
                      confirmMessage={t("table.deleteConfirm", { n: a.n })}
                    />
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
            {attempts.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={9} className="text-muted">
                  {t("table.empty")}
                </Table.Cell>
              </Table.Row>
            ) : null}
          </Table.Body>
        </Table.Root>
      </Tabs.Content>

      <Tabs.Content value="timeline" className="mt-4">
        <p className="text-muted mb-3.5 text-xs">
          {tTimeline("aggregatedOver", { count: attempts.length })}
        </p>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {batchPhaseStats.map((bp) => {
            const color = phaseColor(bossId, bp.order, bp.name);
            const reachedPct = bp.total > 0 ? Math.round((bp.reached / bp.total) * 100) : 0;
            return (
              <Card
                key={bp.name}
                size="1"
                className="border-line bg-surface border"
                style={{ borderTop: `3px solid ${color}` }}
              >
                <div
                  className="font-heading mb-1 text-xs font-bold"
                  style={{ color: readableHeadingColor(color) }}
                >
                  {bp.name}
                </div>
                <div className="text-muted-strong mb-1 text-[10px]">
                  {tTimeline("reached", { reached: bp.reached, total: bp.total })}
                </div>
                <div className="bg-line-soft mb-1.5 h-1 overflow-hidden rounded-full">
                  <div className="h-full" style={{ width: `${reachedPct}%`, background: color }} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {bp.mechanics.map((m) => (
                    <span
                      key={m.mechanicName}
                      title={tTimeline("missedXTimes", { name: m.displayName, count: m.count })}
                      className="bg-line-soft/40 flex items-center gap-1 rounded-sm px-1.5 py-1"
                    >
                      {failMechanicIcon(m.mechanicName)}
                      <span className="text-foreground-strong text-[11px] font-bold">
                        {m.count}
                      </span>
                    </span>
                  ))}
                  {bp.mechanics.length === 0 ? (
                    <span className="text-muted text-[11px]">{tTimeline("noFails")}</span>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="text-muted-strong mb-2.5 text-sm font-semibold">
          {tTimeline("attemptHistory")}
        </div>
        <MechanicFilterAccordion
          bossId={bossId}
          phaseGroups={phaseFilterGroups}
          multiPhaseAttacks={multiPhaseAttacks}
          multiPhaseFails={multiPhaseFails}
          otherEntries={otherMechanicEntries}
          hidden={hiddenMechanics}
          onToggle={toggleMechanic}
          onSelectAll={selectAllMechanics}
          onDeselectAll={deselectAllMechanics}
          playerNames={playerNames}
          selectedPlayer={selectedPlayer}
          onSelectPlayer={setSelectedPlayer}
        />
        <div className="border-line bg-surface divide-line-soft flex flex-col divide-y rounded-sm border">
          {attempts.map((a) => {
            const isOpen = expanded === a.n;
            return (
              <div key={a.logFileId}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : a.n)}
                  className="grid w-full grid-cols-[16px_28px_48px_1fr_48px] items-center gap-3.5 px-4 py-2.5 text-left"
                >
                  <ChevronRightIcon
                    className="text-muted h-4 w-4 transition-transform"
                    style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                  />
                  <span className="text-muted text-xs">{a.n}</span>
                  <span
                    className={
                      a.success
                        ? "text-success text-xs font-semibold"
                        : "text-danger text-xs font-semibold"
                    }
                  >
                    {a.success ? tCommon("kill") : tCommon("wipe")}
                  </span>
                  <AttemptTimeline
                    data={a}
                    hiddenMechanics={hiddenMechanics}
                    selectedPlayer={selectedPlayer}
                    bossHealthPercent={a.bossHealthPercent}
                    furthestPhaseOrder={a.furthestPhase?.order}
                    className="justify-self-start"
                    style={{ width: `${Math.max((a.durationMs / maxDurationMs) * 100, 4)}%` }}
                  />
                  <span className="text-muted-strong text-right text-xs">
                    {formatDuration(a.durationMs)}
                  </span>
                </button>
                {isOpen ? (
                  <div className="border-line-soft bg-background border-t px-4 py-3.5 pl-[62px]">
                    {/* Small stat overview first — the attempt-level numbers
                        that used to only live in the collapsed row above,
                        now spelled out here since the phase cards below no
                        longer carry any text of their own. */}
                    <div className="border-line-soft mb-3.5 flex flex-wrap gap-x-6 gap-y-2 border-b pb-3.5">
                      <StatItem label={tTimeline("stats.log")} value={a.fileName} />
                      <StatItem
                        label={tTimeline("stats.recordedAt")}
                        value={formatDateTime(a.recordedAt, locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      />
                      <StatItem
                        label={tTimeline("stats.result")}
                        value={a.success ? tCommon("kill") : tCommon("wipe")}
                        valueClassName={a.success ? "text-success" : "text-danger"}
                      />
                      <StatItem label={tTimeline("stats.mode")} value={a.isCM ? "CM" : "NM"} />
                      <StatItem
                        label={tTimeline("stats.furthestPhase")}
                        value={
                          a.furthestPhase ? (
                            <span className="inline-flex items-center gap-2">
                              <PhaseBadge
                                bossId={a.bossId}
                                name={a.furthestPhase.name}
                                order={a.furthestPhase.order}
                              />
                              {a.bossHealthPercent !== null ? (
                                <span className="text-muted-strong text-xs">
                                  {formatPercent(a.bossHealthPercent, locale)}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            tCommon("dash")
                          )
                        }
                      />
                      <StatItem
                        label={tTimeline("stats.duration")}
                        value={formatDuration(a.durationMs)}
                      />
                      <StatItem
                        label={tTimeline("stats.reveals")}
                        value={String(
                          a.mechanics.filter(
                            (m) =>
                              m.mechanicName === "Revealed" &&
                              (selectedPlayer === null || m.player === selectedPlayer),
                          ).length,
                        )}
                      />
                      <StatItem
                        label={tTimeline("stats.downstates")}
                        value={String(
                          a.mechanics.filter(
                            (m) =>
                              m.mechanicName === "Downed" &&
                              (selectedPlayer === null || m.player === selectedPlayer),
                          ).length,
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                      {a.phases.map((phase) => {
                        // Boss-attack cast markers ride along in phase.mechanics
                        // (needed to build the filter accordion above) but stay
                        // out of this icon-only fail summary.
                        const failMechanics = phase.mechanics.filter(
                          (m) =>
                            !isVisibleCastMarker(a.bossId, m.mechanicName) &&
                            (selectedPlayer === null || m.player === selectedPlayer),
                        );
                        const failGroups = groupFailMechanics(failMechanics);
                        return (
                          <div
                            key={phase.order}
                            className="bg-surface-2 border-line border-l-3 rounded-sm border-y border-r px-2.5 py-2"
                            style={{
                              borderLeftColor: phaseColor(a.bossId, phase.order, phase.name),
                            }}
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-1.5">
                              <span className="text-muted flex items-center gap-1.5 text-xs uppercase">
                                {phase.name}
                                {phase.reached && phase.success ? (
                                  <CheckCircledIcon className="text-success h-4 w-4" />
                                ) : null}
                              </span>
                              {phase.reached ? (
                                <span className="text-muted-strong text-xs">
                                  {formatDuration(phase.durationMs)}
                                </span>
                              ) : null}
                            </div>
                            {failGroups.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {failGroups.map((g) => (
                                  <MechanicHoverCard
                                    key={g.mechanicName}
                                    cluster={g}
                                    icon={failMechanicIcon(g.mechanicName, { size: "md" })}
                                  >
                                    <span className="bg-line-soft/40 flex items-center gap-1 rounded-sm px-2 py-1.5">
                                      {failMechanicIcon(g.mechanicName, { size: "md" })}
                                      <span className="text-foreground-strong text-xs font-bold">
                                        {g.count}
                                      </span>
                                    </span>
                                  </MechanicHoverCard>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <Link
                      href={`/projects/${projectId}/batches/${batchId}/logs/${a.logFileId}`}
                      className="text-accent mt-3 inline-block text-xs hover:underline"
                    >
                      {tTimeline("viewFullLog")}
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })}
          {attempts.length === 0 ? (
            <div className="text-muted px-4 py-3 text-sm">{tTimeline("empty")}</div>
          ) : null}
        </div>
      </Tabs.Content>

      <Tabs.Content value="roster" className="mt-4">
        <Table.Root variant="surface" className="border-line bg-surface border">
          <Table.Header>
            <Table.Row>
              {rosterHeader("account", t("roster.player"))}
              {rosterHeader("role", t("roster.role"))}
              {rosterHeader("encounters", t("roster.participations"))}
              {rosterHeader("kills", t("roster.kills"))}
              {rosterHeader("avgDps", t("roster.avgDps"))}
              {rosterHeader("avgDowns", t("roster.avgDowns"))}
              {rosterHeader("failedMechanics", t("roster.failedMechanics"))}
              {rosterHeader("shockwaves", t("roster.shockwaves"), t("roster.shockwavesHint"))}
              {rosterHeader("debilitatedHits", t("roster.debilitated"))}
              {rosterHeader("revealCount", t("roster.revealed"), t("roster.revealedHint"))}
              {rosterHeader("chomps", t("roster.chomps"), t("roster.chompsHint"))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sortedRoster.map((entry) => (
              <Table.Row key={entry.account}>
                <Table.Cell>
                  <div className="flex items-center gap-2.5">
                    <span className="bg-line h-[22px] w-[22px] shrink-0 rounded-full" />
                    <div>
                      <Link
                        href={`/projects/${projectId}/batches/${batchId}/players/${encodeURIComponent(entry.account)}`}
                        className="text-foreground font-semibold hover:underline"
                      >
                        {entry.account}
                      </Link>
                      <div className="text-muted text-xs">{entry.characterNames}</div>
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell className="text-muted-strong">{entry.role}</Table.Cell>
                <Table.Cell className="text-muted-strong">{entry.encounters}</Table.Cell>
                <Table.Cell className="text-muted-strong">{entry.kills}</Table.Cell>
                <Table.Cell className="text-muted-strong">{entry.avgDps}</Table.Cell>
                <Table.Cell className="text-muted-strong">{entry.avgDowns}</Table.Cell>
                <Table.Cell className="text-danger font-semibold">
                  {entry.failedMechanics}
                </Table.Cell>
                <Table.Cell className="text-warning font-semibold">
                  {entry.shockwavesPlayed > 0
                    ? `${Math.round((entry.shockwavesHit / entry.shockwavesPlayed) * 100)}%`
                    : tCommon("dash")}{" "}
                  <span className="text-muted text-sm font-medium">
                    ({entry.shockwavesHit}/{entry.shockwavesPlayed})
                  </span>
                </Table.Cell>
                <Table.Cell className="text-warning font-semibold">
                  {entry.debilitatedHits}
                </Table.Cell>
                <Table.Cell className="text-warning font-semibold">
                  {entry.stealthWindows > 0
                    ? `${Math.round((entry.revealCount / entry.stealthWindows) * 100)}%`
                    : tCommon("dash")}{" "}
                  <span className="text-muted text-sm font-medium">
                    ({entry.revealCount}/{entry.stealthWindows})
                  </span>
                </Table.Cell>
                <Table.Cell className="text-warning font-semibold">
                  {entry.chompAttempts > 0
                    ? `${Math.round((entry.chompedAttempts / entry.chompAttempts) * 100)}%`
                    : tCommon("dash")}{" "}
                  <span className="text-muted text-sm font-medium">
                    ({entry.chompedAttempts}/{entry.chompAttempts})
                  </span>
                </Table.Cell>
              </Table.Row>
            ))}
            {roster.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={11} className="text-muted">
                  {t("roster.empty")}
                </Table.Cell>
              </Table.Row>
            ) : null}
          </Table.Body>
        </Table.Root>
      </Tabs.Content>
    </Tabs.Root>
  );
}
