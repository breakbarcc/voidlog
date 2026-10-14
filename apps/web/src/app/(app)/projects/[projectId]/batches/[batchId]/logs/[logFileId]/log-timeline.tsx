"use client";

import { ChevronRightIcon } from "@radix-ui/react-icons";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircledIcon } from "@radix-ui/react-icons";
import {
  AttackGlyph,
  attackType,
  DeathIcon,
  failMechanicIcon,
  tooltipMechanicIcon,
} from "@/components/mechanic-icons";
import { AttemptTimeline } from "@/components/attempt-timeline";
import { readableHeadingColor } from "@/components/phase-badge";
import type { AttemptTimelineData } from "@/lib/attempt-timeline";

export type EventCategory = "fail" | "info" | "ok" | "down" | "death";

export interface LogEvent {
  id: string;
  timeMs: number;
  /** Raw mechanic name — events of one type are grouped on it. */
  type: string;
  label: string;
  category: EventCategory;
  playerId: string | null;
}

export interface LogPhase {
  key: string;
  name: string;
  kind: "boss" | "transition";
  startMs: number;
  endMs: number;
  color: string;
  aliveAtStart: number | null;
  status: "completed" | "reached" | "wipe" | "notReached";
  events: LogEvent[];
}

export interface LogPlayer {
  id: string;
  name: string;
  account: string;
  role: string | null;
}

export interface LogTimelineData {
  /** Same lanes as the batch page's attempt rows (components/attempt-timeline.tsx). */
  timeline: AttemptTimelineData;
  durationMs: number;
  playerCount: number;
  players: LogPlayer[];
  phases: LogPhase[];
}

// Chip order when a collapsed phase has more groups than fit: the severity
// ladder from the design handoff.
const SEVERITY: Record<EventCategory, number> = { fail: 0, death: 1, down: 2, info: 3, ok: 4 };
const MAX_CHIPS = 5;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Same glyphs as the batch timeline: a boss attack or bait draws its own
// attack glyph, a downstate the downed icon, a death the red cross, a fail
// the mechanic's icon (or the generic warning triangle).
function EventIcon({ type, category }: Readonly<{ type: string; category: EventCategory }>) {
  if (category === "death") return <DeathIcon />;
  if (category === "down") return failMechanicIcon("Downed");
  const attack = attackType(type);
  if (attack) return <AttackGlyph type={attack} />;
  if (category === "ok") return <CheckCircledIcon className="text-success h-3.5 w-3.5" />;
  if (category === "info") {
    return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "#8B2FD1" }} />;
  }
  return tooltipMechanicIcon(type);
}

// Icon for a whole category — used by the legend.
function CategoryIcon({ category }: Readonly<{ category: EventCategory }>) {
  switch (category) {
    case "fail":
      return failMechanicIcon("");
    case "info":
      return <AttackGlyph type="slam" />;
    case "ok":
      return <CheckCircledIcon className="text-success h-3.5 w-3.5" />;
    case "down":
      return failMechanicIcon("Downed");
    case "death":
      return <DeathIcon />;
  }
}

function isCritical(category: EventCategory): boolean {
  return category === "fail" || category === "down" || category === "death";
}

export function LogTimeline({ data }: Readonly<{ data: LogTimelineData }>) {
  const t = useTranslations("logDetail");
  const tCommon = useTranslations("common");

  const [criticalOnly, setCriticalOnly] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default: the phase the attempt ended in and the one with the most fails.
    const open = new Set<string>();
    const reached = data.phases.filter((p) => p.status !== "notReached");
    const last = reached.at(-1);
    if (last) open.add(last.key);
    let worst: LogPhase | null = null;
    let worstFails = 0;
    for (const phase of reached) {
      const fails = phase.events.filter((e) => e.category === "fail").length;
      if (fails > worstFails) {
        worst = phase;
        worstFails = fails;
      }
    }
    if (worst) open.add(worst.key);
    return open;
  });

  const allEvents = useMemo(() => data.phases.flatMap((p) => p.events), [data.phases]);
  const totals = useMemo(() => {
    const count = (c: EventCategory) => allEvents.filter((e) => e.category === c).length;
    return { fail: count("fail"), down: count("down"), death: count("death") };
  }, [allEvents]);

  const perPlayer = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of allEvents) {
      if (!e.playerId) continue;
      if (e.category === "fail" || e.category === "death") {
        map.set(e.playerId, (map.get(e.playerId) ?? 0) + 1);
      }
    }
    return map;
  }, [allEvents]);

  const expandablePhases = data.phases.filter((p) => p.status !== "notReached");
  const allExpanded = expandablePhases.every((p) => expanded.has(p.key));

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function visible(events: LogEvent[]): LogEvent[] {
    return events.filter((e) => {
      if (criticalOnly && !isCritical(e.category)) return false;
      if (playerId && e.playerId !== playerId) return false;
      return true;
    });
  }

  const statusLabel = (status: LogPhase["status"]) =>
    status === "wipe" ? tCommon("wipe") : t(status);
  const statusClass: Record<LogPhase["status"], string> = {
    completed: "bg-warning/15 text-warning",
    wipe: "bg-danger/15 text-danger",
    reached: "bg-line-soft text-muted-strong",
    notReached: "bg-line-soft/60 text-muted",
  };

  const duration = Math.max(1, data.durationMs);
  const ticks: number[] = [];
  for (let s = 60; s * 1000 < duration; s += 60) ticks.push(s);

  const playerName = (id: string | null) => data.players.find((p) => p.id === id)?.name;

  return (
    <div>
      {/* Overview: the same timeline as on the batch page */}
      <div className="border-line bg-surface mb-6 rounded-sm border px-5 pb-3 pt-4">
        <div className="font-heading text-foreground mb-3 text-sm font-semibold">
          {t("overview.title")}
        </div>
        <AttemptTimeline data={data.timeline} />
        <div className="text-muted relative mt-1 h-4 text-[10.5px]">
          <span className="absolute left-0">0:00</span>
          {ticks.map((s) => (
            <span
              key={s}
              className="absolute -translate-x-1/2 tabular-nums"
              style={{ left: `${((s * 1000) / duration) * 100}%` }}
            >
              {formatClock(s * 1000)}
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex items-center justify-between">
        <div className="border-line bg-surface inline-flex rounded-sm border p-0.5 text-sm">
          {[
            { value: false, label: t("filter.all") },
            { value: true, label: t("filter.critical") },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setCriticalOnly(option.value)}
              className={`rounded-sm px-3 py-1.5 font-medium ${
                criticalOnly === option.value
                  ? "bg-primary text-white"
                  : "text-muted-strong hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="text-accent text-sm hover:underline"
          onClick={() =>
            setExpanded(allExpanded ? new Set() : new Set(expandablePhases.map((p) => p.key)))
          }
        >
          {allExpanded ? t("collapseAll") : t("expandAll")}
        </button>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {data.players.map((p) => {
          const count = perPlayer.get(p.id) ?? 0;
          const active = playerId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              title={p.account}
              onClick={() => setPlayerId(active ? null : p.id)}
              className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 text-sm ${
                active
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-line bg-surface text-muted-strong hover:border-primary"
              }`}
            >
              <span className="font-semibold">{p.name}</span>
              {p.role ? <span className="text-muted text-xs">{p.role}</span> : null}
              {count > 0 ? <span className="text-danger text-xs font-bold">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {/* Vertical timeline */}
      <div>
        {data.phases.map((phase) => {
          const transition = phase.kind === "transition";
          const notReached = phase.status === "notReached";
          const open = expanded.has(phase.key) && !notReached;
          const events = visible(phase.events);
          const fails = phase.events.filter((e) => e.category === "fail").length;
          const downs = phase.events.filter((e) => e.category === "down").length;
          const deaths = phase.events.filter((e) => e.category === "death").length;
          const heading = readableHeadingColor(phase.color);

          const chips = (() => {
            const groups = new Map<string, { event: LogEvent; count: number }>();
            for (const e of events) {
              const key = `${e.category}|${e.type}`;
              const group = groups.get(key);
              if (group) group.count += 1;
              else groups.set(key, { event: e, count: 1 });
            }
            return [...groups.values()]
              .sort(
                (a, b) =>
                  SEVERITY[a.event.category] - SEVERITY[b.event.category] || b.count - a.count,
              )
              .slice(0, MAX_CHIPS);
          })();

          return (
            <div
              key={phase.key}
              className="grid grid-cols-[56px_22px_1fr]"
              style={{ opacity: notReached ? 0.5 : 1 }}
            >
              <div className="pr-2 pt-3.5 text-right">
                {notReached ? null : (
                  <>
                    <div className="text-foreground text-xs font-semibold tabular-nums">
                      {formatClock(phase.startMs)}
                    </div>
                    <div className="text-muted text-[10.5px] tabular-nums">
                      {Math.round((phase.endMs - phase.startMs) / 1000)} s
                    </div>
                  </>
                )}
              </div>
              <div className="relative">
                <div
                  className="absolute bottom-0 left-1/2 top-0 -translate-x-1/2"
                  style={{
                    width: transition ? 2 : 3,
                    background: phase.color,
                    opacity: transition ? 0.4 : 0.9,
                  }}
                />
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-full"
                  style={{
                    top: 16,
                    width: transition ? 8 : 12,
                    height: transition ? 8 : 12,
                    background: phase.color,
                    boxShadow: "0 0 0 3px #0A0912",
                  }}
                />
              </div>
              <div className="pb-3">
                <div
                  className={`rounded-sm ${
                    transition ? "" : "border border-[#251F35] bg-[#15121F]"
                  }`}
                  style={transition ? undefined : { borderLeft: `3px solid ${phase.color}` }}
                >
                  <button
                    type="button"
                    disabled={notReached}
                    onClick={() => toggle(phase.key)}
                    className={`flex w-full items-center justify-between gap-3 text-left ${
                      transition ? "px-3 py-2" : "px-4 py-3"
                    } ${notReached ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <ChevronRightIcon
                        className="text-muted shrink-0 transition-transform"
                        style={{ transform: open ? "rotate(90deg)" : undefined }}
                      />
                      <span
                        className={`font-heading font-semibold ${
                          transition ? "text-muted-strong text-sm" : "text-foreground text-[15.5px]"
                        }`}
                        style={transition ? undefined : { color: heading }}
                      >
                        {phase.name}
                      </span>
                      <span
                        className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${statusClass[phase.status]}`}
                      >
                        {statusLabel(phase.status)}
                      </span>
                    </span>
                    {notReached ? null : (
                      <span className="flex items-center gap-3 text-xs font-semibold">
                        {fails > 0 ? (
                          <span className="text-danger inline-flex items-center gap-1">
                            <CategoryIcon category="fail" />
                            {fails}
                          </span>
                        ) : null}
                        {downs > 0 ? (
                          <span className="text-warning inline-flex items-center gap-1">
                            <CategoryIcon category="down" />
                            {downs}
                          </span>
                        ) : null}
                        {deaths > 0 ? (
                          <span className="text-danger inline-flex items-center gap-1">
                            <CategoryIcon category="death" />
                            {deaths}
                          </span>
                        ) : null}
                        {phase.aliveAtStart !== null ? (
                          <span className="text-muted font-normal">
                            {t("alive", { alive: phase.aliveAtStart, total: data.playerCount })}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </button>

                  {notReached ? null : open ? (
                    <div className="border-t border-[#211D30] px-4 py-2">
                      {events.length === 0 ? (
                        <p className="text-muted py-2 text-sm">{t("noEvents")}</p>
                      ) : (
                        events.map((e) => {
                          const player = playerName(e.playerId);
                          const isDeath = e.category === "death";
                          return (
                            <div
                              key={e.id}
                              className={`group grid grid-cols-[68px_14px_1fr_auto] items-center gap-2 rounded-sm px-1.5 py-1 text-sm transition-colors ${
                                isDeath
                                  ? "bg-danger/10 hover:bg-danger/20"
                                  : e.category === "fail"
                                    ? "hover:bg-danger/15"
                                    : "hover:bg-white/5"
                              }`}
                            >
                              <span className="text-muted text-xs tabular-nums">
                                {formatClock(e.timeMs)}
                                <span className="text-muted/60 text-[10px]">
                                  .{String(Math.round(e.timeMs) % 1000).padStart(3, "0")}
                                </span>
                              </span>
                              <EventIcon type={e.type} category={e.category} />
                              <span className="text-foreground">{e.label}</span>
                              <span
                                className={`text-sm ${
                                  isDeath
                                    ? "text-danger font-semibold"
                                    : "text-muted group-hover:text-foreground-strong group-hover:font-semibold"
                                }`}
                              >
                                {player ?? ""}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : chips.length > 0 ? (
                    <div className="flex flex-wrap gap-2 px-4 pb-3">
                      {chips.map(({ event, count }) => {
                        const bad = event.category === "fail" || event.category === "death";
                        return (
                          <span
                            key={`${event.category}|${event.type}`}
                            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs ${
                              bad
                                ? "border-danger/40 bg-danger/10 text-foreground"
                                : "border-line bg-surface-2 text-muted-strong"
                            }`}
                          >
                            <EventIcon type={event.type} category={event.category} />
                            {event.label}
                            <span
                              className={`font-bold ${
                                bad
                                  ? "text-danger"
                                  : event.category === "down"
                                    ? "text-warning"
                                    : "text-muted"
                              }`}
                            >
                              ×{count}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
