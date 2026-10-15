"use client";

import { Card } from "@radix-ui/themes";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/locale";
import { formatPercent } from "@/lib/utils";

export interface GreenRow {
  phase: string;
  /** Compass position of the circle ("NE", "SE", ...). */
  label: string;
  role: string | null;
  played: number;
  failed: number;
}

export interface GreenPhase {
  name: string;
  color: string;
  /** Waves played in the phase — the same for each of its circles. */
  waves: number;
}

type View = "heatmap" | "bars" | "ranking";
const VIEWS: View[] = ["heatmap", "bars", "ranking"];

const rateOf = (r: { played: number; failed: number }) =>
  r.played > 0 ? (r.failed / r.played) * 100 : 0;

/**
 * Which Green circle — and so which role — the squad fails, over the whole
 * project, in three views of the same numbers: a heatmap for the overview,
 * bars per phase on one shared scale for comparing, and a ranking for "what
 * to practise first". A role tile highlights that role in every view.
 */
export function GreensByRoleView({
  rows,
  phases,
}: Readonly<{ rows: GreenRow[]; phases: GreenPhase[] }>) {
  const t = useTranslations("statistics.greensByRole");
  const locale = useLocale() as Locale;
  const [view, setView] = useState<View>("bars");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const pct = (value: number) => formatPercent(value, locale);
  // One scale across every phase, so bar lengths and heat are comparable.
  const maxRate = Math.max(...rows.map(rateOf), 0.0001);
  // Red from faint to full by share of the worst circle, over the card surface.
  const heat = (rate: number, min: number, span: number) =>
    `color-mix(in srgb, var(--danger) ${Math.round(min + (rate / maxRate) * span)}%, var(--surface))`;

  const dimmed = (row: GreenRow) => selectedRole !== null && row.role !== selectedRole;

  // The same role in different phases, rolled up.
  const roleTotals = new Map<string, { played: number; failed: number }>();
  for (const row of rows) {
    if (!row.role) continue;
    const entry = roleTotals.get(row.role) ?? { played: 0, failed: 0 };
    entry.played += row.played;
    entry.failed += row.failed;
    roleTotals.set(row.role, entry);
  }
  const roles = [...roleTotals].sort((a, b) => rateOf(b[1]) - rateOf(a[1]));

  const rowsOf = (phase: string) =>
    rows.filter((r) => r.phase === phase).sort((a, b) => rateOf(b) - rateOf(a));
  const ranked = [...rows].sort((a, b) => rateOf(b) - rateOf(a) || b.played - a.played);
  const phaseOf = (name: string) => phases.find((p) => p.name === name);

  const PhaseLabel = ({ phase }: { phase: GreenPhase }) => (
    <div>
      <div className="text-foreground-strong flex items-center gap-2 text-sm font-semibold">
        <span
          className="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: phase.color }}
        />
        {phase.name}
      </div>
      <div className="text-muted mt-0.5 pl-[18px] text-[11px]">
        {t("waves", { count: phase.waves })}
      </div>
    </div>
  );

  return (
    <Card size="3" className="border-line bg-surface mb-6 border">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-foreground-strong text-sm font-semibold">{t("title")}</div>
          <p className="text-muted mt-1 max-w-xl text-xs leading-relaxed">{t("hint")}</p>
        </div>
        <div className="border-line bg-surface-2 inline-flex rounded-sm border p-0.5 text-xs">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-sm px-3 py-1.5 font-medium ${
                view === v ? "bg-primary text-white" : "text-muted-strong hover:text-foreground"
              }`}
            >
              {t(`views.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {roles.length > 0 ? (
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {roles.map(([role, total]) => (
            <button
              key={role}
              type="button"
              aria-pressed={selectedRole === role}
              onClick={() => setSelectedRole(selectedRole === role ? null : role)}
              className={`bg-surface-2 rounded-sm border px-4 py-3 text-left transition-colors ${
                selectedRole === role ? "border-primary" : "border-line hover:border-muted"
              }`}
            >
              <div className="text-muted text-[11px] font-medium uppercase tracking-wide">
                {role}
              </div>
              <div className="font-heading text-foreground-strong mt-1 text-2xl font-bold">
                {pct(rateOf(total))}{" "}
                <span className="text-muted text-xs font-normal">
                  ({total.failed}/{total.played})
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-muted mb-4 text-xs">
        {t("roleHint")} {t(`viewHint.${view}`)}
      </p>

      {view === "bars" ? (
        <div className="flex flex-col gap-4">
          {phases.map((phase) => (
            <div key={phase.name} className="grid grid-cols-[140px_1fr] items-start gap-4">
              <PhaseLabel phase={phase} />
              <div className="flex flex-col gap-1.5">
                {rowsOf(phase.name).map((row) => (
                  <div
                    key={row.label}
                    className={`grid grid-cols-[150px_1fr_120px] items-center gap-3 text-xs transition-opacity ${
                      dimmed(row) ? "opacity-30" : ""
                    }`}
                  >
                    <span className="text-foreground">
                      <span className="text-foreground-strong font-bold">{row.label}</span>{" "}
                      {row.role}
                    </span>
                    <span className="bg-surface-2 block h-3 rounded-[2px]">
                      <span
                        className="block h-3 rounded-[2px]"
                        style={{
                          width: `${(rateOf(row) / maxRate) * 100}%`,
                          background: heat(rateOf(row), 35, 65),
                        }}
                      />
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="text-foreground-strong font-bold">{pct(rateOf(row))}</span>{" "}
                      <span className="text-muted">
                        {row.failed}/{row.played}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view === "heatmap" ? (
        <div className="grid grid-cols-[150px_repeat(3,minmax(0,1fr))] items-stretch gap-2">
          <span />
          {[t("mostFrequent"), "2.", "3."].map((heading) => (
            <span
              key={heading}
              className="text-muted text-[10px] font-medium uppercase tracking-wide"
            >
              {heading}
            </span>
          ))}
          {phases.map((phase) => (
            <div key={phase.name} className="contents">
              <div className="self-center">
                <PhaseLabel phase={phase} />
              </div>
              {rowsOf(phase.name).map((row) => (
                <div
                  key={row.label}
                  className={`rounded-sm px-3.5 py-2.5 transition-opacity ${
                    dimmed(row) ? "opacity-30" : ""
                  }`}
                  style={{ background: heat(rateOf(row), 15, 70) }}
                >
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-foreground-strong font-bold">{row.label}</span>
                    <span className="text-muted-strong">{row.role}</span>
                  </div>
                  <div className="font-heading text-foreground-strong mt-1 text-xl font-bold">
                    {pct(rateOf(row))}
                  </div>
                  <div className="text-muted-strong text-[11px] tabular-nums">
                    {row.failed}/{row.played}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {view === "ranking" ? (
        <div className="text-sm">
          <div className="text-muted grid grid-cols-[28px_130px_170px_1fr_70px] gap-3 px-2 pb-2 text-[10px] font-medium uppercase tracking-wide">
            <span>#</span>
            <span>{t("columns.phase")}</span>
            <span>{t("columns.circleRole")}</span>
            <span>{t("columns.rate")}</span>
            <span className="text-right">{t("columns.failed")}</span>
          </div>
          {ranked.map((row, i) => {
            const phase = phaseOf(row.phase);
            return (
              <div
                key={`${row.phase}|${row.label}`}
                className={`border-line-soft grid grid-cols-[28px_130px_170px_1fr_70px] items-center gap-3 border-t px-2 py-2 transition-opacity hover:bg-white/5 ${
                  dimmed(row) ? "opacity-30" : ""
                }`}
              >
                <span className="text-muted text-xs tabular-nums">{i + 1}</span>
                <span className="text-foreground flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[2px]"
                    style={{ background: phase?.color }}
                  />
                  {row.phase}
                </span>
                <span className="text-foreground">
                  <span className="text-foreground-strong font-bold">{row.label}</span> {row.role}
                </span>
                <span className="flex items-center gap-3">
                  <span className="bg-surface-2 block h-3 flex-1 rounded-[2px]">
                    <span
                      className="block h-3 rounded-[2px]"
                      style={{
                        width: `${(rateOf(row) / maxRate) * 100}%`,
                        background: heat(rateOf(row), 35, 65),
                      }}
                    />
                  </span>
                  <span className="text-danger w-14 text-right text-xs font-bold tabular-nums">
                    {pct(rateOf(row))}
                  </span>
                </span>
                <span className="text-muted text-right text-xs tabular-nums">
                  {row.failed}/{row.played}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
