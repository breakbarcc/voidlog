"use client";

import { Table } from "@radix-ui/themes";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import type { Locale } from "@/i18n/locale";
import { formatDate } from "@/lib/utils";

export interface RosterRow {
  account: string;
  characterNames: string;
  role: string;
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
  lastActive: Date;
}

type SortKey =
  | "account"
  | "role"
  | "encounters"
  | "kills"
  | "avgDps"
  | "avgDowns"
  | "shockwaves"
  | "debilitatedHits"
  | "revealCount"
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
  shockwaves: "desc",
  debilitatedHits: "desc",
  revealCount: "desc",
  lastActive: "desc",
};

// Share of the played shockwaves that hit the player; null when they played
// none (sorts below 0%).
function shockwaveShare(row: RosterRow): number | null {
  return row.shockwavesPlayed > 0 ? row.shockwavesHit / row.shockwavesPlayed : null;
}

// "—" (no data) sorts below every real average.
function average(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? -1 : n;
}

function compareRows(a: RosterRow, b: RosterRow, key: SortKey): number {
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
    case "lastActive":
      return a.lastActive.getTime() - b.lastActive.getTime();
  }
}

export function RosterTable({ roster }: Readonly<{ roster: RosterRow[] }>) {
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
          {header("shockwaves", t("columns.shockwaves"), t("columns.shockwavesHint"))}
          {header("debilitatedHits", t("columns.debilitated"), t("columns.perFightHint"))}
          {header("revealCount", t("columns.revealed"), t("columns.perFightHint"))}
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
                  <div className="text-foreground font-semibold">{entry.account}</div>
                  <div className="text-muted text-xs">{entry.characterNames}</div>
                </div>
              </div>
            </Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.role}</Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.encounters}</Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.kills}</Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.avgDps}</Table.Cell>
            <Table.Cell className="text-muted-strong">{entry.avgDowns}</Table.Cell>
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
            <Table.Cell className="text-muted text-sm">
              {formatDate(entry.lastActive, locale)}
            </Table.Cell>
          </Table.Row>
        ))}
        {sorted.length === 0 ? (
          <Table.Row>
            <Table.Cell colSpan={10} className="text-muted">
              {t("empty")}
            </Table.Cell>
          </Table.Row>
        ) : null}
      </Table.Body>
    </Table.Root>
  );
}
