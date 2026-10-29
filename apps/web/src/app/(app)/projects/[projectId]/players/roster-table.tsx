"use client";

import { Table } from "@radix-ui/themes";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RoleSelect } from "@/components/role-select";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import type { Locale } from "@/i18n/locale";
import { formatDate } from "@/lib/utils";

export interface RosterRow {
  account: string;
  characterNames: string;
  /** Role assigned for the project in this table; null when none is. */
  role: string | null;
  encounters: number;
  kills: number;
  avgDps: number;
  avgDowns: string;
  shockwavesPlayed: number;
  shockwavesHit: number;
  debilitatedHits: number;
  debilitatedHitsPerEncounter: string;
  revealCount: number;
  revealCountPerEncounter: string;
  chompAttempts: number;
  chompedAttempts: number;
  /** Greens waves the player's role had a circle in (while they were up). */
  greensExpected: number;
  /** Of those, the ones they weren't in their circle. */
  greensMissed: number;
  /** Waves their circle resolved while they were downed or dead (not counted). */
  greensUnavailable: number;
  lastActive: Date;
}

type SortKey =
  | "account"
  | "role"
  | "encounters"
  | "kills"
  | "avgDps"
  | "avgDowns"
  | "greens"
  | "shockwaves"
  | "debilitatedHits"
  | "revealCount"
  | "chomps"
  | "lastActive";

// Text/date columns read more naturally starting ascending (A→Z, oldest
// first); numeric performance stats are more useful starting descending
// (highest first) — matches the table's original default sort (most
// encounters first).
const DEFAULT_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  account: "asc",
  role: "asc",
  encounters: "desc",
  kills: "desc",
  avgDps: "desc",
  avgDowns: "desc",
  greens: "desc",
  shockwaves: "desc",
  debilitatedHits: "desc",
  revealCount: "desc",
  chomps: "desc",
  lastActive: "desc",
};

// Share of the played shockwaves that hit the player; null when they played
// none (sorts below 0%).
function shockwaveShare(row: RosterRow): number | null {
  return row.shockwavesPlayed > 0 ? row.shockwavesHit / row.shockwavesPlayed : null;
}

// Share of the player's Greens they missed; null when their role had none
// (sorts below 0%).
function greensShare(row: RosterRow): number | null {
  return row.greensExpected > 0 ? row.greensMissed / row.greensExpected : null;
}

// Share of the attempts reaching Primordus's attacks in which the player got
// chomped; null when they reached none (sorts below 0%).
function chompShare(row: RosterRow): number | null {
  return row.chompAttempts > 0 ? row.chompedAttempts / row.chompAttempts : null;
}

function compareRows(a: RosterRow, b: RosterRow, key: SortKey): number {
  switch (key) {
    case "account":
      return a.account.localeCompare(b.account);
    case "role":
      return (a.role ?? "").localeCompare(b.role ?? "");
    case "encounters":
      return a.encounters - b.encounters;
    case "kills":
      return a.kills - b.kills;
    case "avgDps":
      return a.avgDps - b.avgDps;
    case "avgDowns":
      return Number.parseFloat(a.avgDowns) - Number.parseFloat(b.avgDowns);
    case "greens":
      return (greensShare(a) ?? -1) - (greensShare(b) ?? -1);
    case "shockwaves":
      return (shockwaveShare(a) ?? -1) - (shockwaveShare(b) ?? -1);
    case "debilitatedHits":
      return (
        Number.parseFloat(a.debilitatedHitsPerEncounter) -
        Number.parseFloat(b.debilitatedHitsPerEncounter)
      );
    case "revealCount":
      return (
        Number.parseFloat(a.revealCountPerEncounter) - Number.parseFloat(b.revealCountPerEncounter)
      );
    case "chomps":
      return (chompShare(a) ?? -1) - (chompShare(b) ?? -1);
    case "lastActive":
      return a.lastActive.getTime() - b.lastActive.getTime();
  }
}

export function RosterTable({
  projectId,
  roster,
  roles,
  canEdit,
}: Readonly<{
  projectId: string;
  roster: RosterRow[];
  /** Roles a player can be assigned (lib/player-roles.ts). */
  roles: readonly string[];
  /** Contributors and admins may assign roles; viewers only read. */
  canEdit: boolean;
}>) {
  const t = useTranslations("roster");
  const locale = useLocale() as Locale;
  const [sortKey, setSortKey] = useState<SortKey>("encounters");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection(DEFAULT_DIRECTION[key]);
    }
  }

  const sorted = useMemo(() => {
    const rows = [...roster].sort((a, b) => compareRows(a, b, sortKey));
    return direction === "asc" ? rows : rows.reverse();
  }, [roster, sortKey, direction]);

  function header(key: SortKey, label: string, hint?: string) {
    return (
      <SortableColumnHeader
        active={sortKey === key}
        direction={direction}
        onClick={() => handleSort(key)}
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

  return (
    <Table.Root variant="surface" className="border-line bg-surface border">
      <Table.Header>
        <Table.Row>
          {header("account", t("columns.player"))}
          {header("role", t("columns.role"))}
          {header("encounters", t("columns.participations"))}
          {header("kills", t("columns.kills"))}
          {header("avgDps", t("columns.avgDps"))}
          {header("avgDowns", t("columns.avgDowns"))}
          {header("greens", t("columns.greensMissed"), t("columns.greensMissedHint"))}
          {header("shockwaves", t("columns.shockwaves"), t("columns.shockwavesHint"))}
          {header("debilitatedHits", t("columns.debilitated"), t("columns.perFightHint"))}
          {header("revealCount", t("columns.revealed"), t("columns.perFightHint"))}
          {header("chomps", t("columns.chomps"), t("columns.chompsHint"))}
          {header("lastActive", t("columns.lastActive"))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {sorted.map((entry) => (
          <Table.Row key={entry.account}>
            <Table.Cell>
              <div className="flex items-center gap-2.5">
                <span className="bg-line h-[22px] w-[22px] shrink-0 rounded-full" />
                <div>
                  <Link
                    href={`/projects/${projectId}/players/${encodeURIComponent(entry.account)}`}
                    className="text-foreground font-semibold hover:underline"
                  >
                    {entry.account}
                  </Link>
                  <div className="text-muted text-xs">{entry.characterNames}</div>
                </div>
              </div>
            </Table.Cell>
            <Table.Cell>
              <RoleSelect
                endpoint={`/api/projects/${projectId}/player-roles`}
                account={entry.account}
                role={entry.role}
                roles={roles}
                canEdit={canEdit}
              />
            </Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.encounters}</Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.kills}</Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.avgDps}</Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.avgDowns}</Table.Cell>
            <Table.Cell
              className="text-danger font-semibold"
              title={
                entry.greensUnavailable > 0
                  ? t("columns.greensUnavailable", { count: entry.greensUnavailable })
                  : undefined
              }
            >
              {entry.greensExpected > 0
                ? `${Math.round((entry.greensMissed / entry.greensExpected) * 100)}%`
                : "—"}{" "}
              <span className="text-muted text-sm font-medium">
                ({entry.greensMissed}/{entry.greensExpected})
              </span>
            </Table.Cell>
            <Table.Cell className="text-warning font-semibold">
              {entry.shockwavesPlayed > 0
                ? `${Math.round((entry.shockwavesHit / entry.shockwavesPlayed) * 100)}%`
                : "—"}{" "}
              <span className="text-muted text-sm font-medium">
                ({entry.shockwavesHit}/{entry.shockwavesPlayed})
              </span>
            </Table.Cell>
            <Table.Cell className="text-warning font-semibold">
              {entry.debilitatedHitsPerEncounter}{" "}
              <span className="text-muted text-sm font-medium">({entry.debilitatedHits})</span>
            </Table.Cell>
            <Table.Cell className="text-warning font-semibold">
              {entry.revealCountPerEncounter}{" "}
              <span className="text-muted text-sm font-medium">({entry.revealCount})</span>
            </Table.Cell>
            <Table.Cell className="text-warning font-semibold">
              {entry.chompAttempts > 0
                ? `${Math.round((entry.chompedAttempts / entry.chompAttempts) * 100)}%`
                : "—"}{" "}
              <span className="text-muted text-sm font-medium">
                ({entry.chompedAttempts}/{entry.chompAttempts})
              </span>
            </Table.Cell>
            <Table.Cell className="text-muted text-sm">
              {formatDate(entry.lastActive, locale)}
            </Table.Cell>
          </Table.Row>
        ))}
        {sorted.length === 0 ? (
          <Table.Row>
            <Table.Cell colSpan={11} className="text-muted">
              {t("empty")}
            </Table.Cell>
          </Table.Row>
        ) : null}
      </Table.Body>
    </Table.Root>
  );
}
