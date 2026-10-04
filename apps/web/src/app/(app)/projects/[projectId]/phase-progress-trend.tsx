"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { phaseColor, readableHeadingColor } from "@/components/phase-badge";
import {
  AREA_COLOR,
  GUTTER,
  PlotAxis,
  PlotGrid,
  StepSeries,
  percent,
  shortPhaseName,
} from "@/components/phase-progress-shared";
import type { Locale } from "@/i18n/locale";
import { formatDate } from "@/lib/utils";

export interface ProgressNight {
  id: string;
  occurredAt: Date;
  attempts: number;
  /** Attempts that reached each phase, keyed by phase name. */
  reached: Record<string, number>;
}

const SELECTED_COLOR = "#c9a8e8";
const FIRST_COLOR = "#8a8299";
const OTHER_COLOR = "#a46be8";
const GOLD = "#e8b84c";
const DANGER = "#e0453d";

function formatNight(date: Date, locale: Locale): string {
  return formatDate(date, locale, { day: "2-digit", month: "2-digit" });
}

function formatDelta(delta: number): string {
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function deltaStyle(delta: number): { background: string; color: string } {
  if (delta > 0) {
    const strength = 0.12 + (0.4 * Math.min(delta, 50)) / 50;
    return { background: `rgba(232, 184, 76, ${strength})`, color: GOLD };
  }
  if (delta < 0) return { background: "rgba(224, 69, 61, 0.16)", color: DANGER };
  return { background: "rgba(107, 100, 120, 0.18)", color: "var(--muted-strong)" };
}

/**
 * How many percent of the attempts reached each main phase, per raid night. The
 * selected night is the filled step area, the first night is the dashed
 * baseline and all others are faint lines — a group that gets more stable
 * shows the later phases pulling away from the baseline.
 */
export function PhaseProgressTrend({
  bossId,
  phases,
  nights,
}: Readonly<{
  bossId: string;
  /** Main phases in fight order. */
  phases: { name: string; order: number }[];
  /** Raid nights, oldest first. */
  nights: ProgressNight[];
}>) {
  const t = useTranslations("projectProgress");
  const locale = useLocale() as Locale;
  const [selectedId, setSelectedId] = useState(nights.at(-1)?.id);

  const first = nights[0];
  const selected = nights.find((n) => n.id === selectedId) ?? nights.at(-1);
  if (!first || !selected) return null;
  const isFirst = selected.id === first.id;

  const pctOf = (night: ProgressNight, phase: string) =>
    percent(night.reached[phase] ?? 0, night.attempts);
  const series = (night: ProgressNight) => phases.map((p) => pctOf(night, p.name));

  const selectedValues = series(selected);
  const firstValues = series(first);
  const deltas = selectedValues.map((v, i) => v - (firstValues[i] ?? 0));
  const best = Math.max(0, ...deltas);
  const bestIndex = deltas.indexOf(best);
  const furthestIndex = selectedValues.findLastIndex((v) => v > 0);
  const firstLabel = formatNight(first.occurredAt, locale);

  const tooltip = (index: number): string => {
    const phase = phases[index];
    if (!phase) return "";
    const lines = [
      phase.name,
      t("tooltipSelected", {
        reached: selected?.reached[phase.name] ?? 0,
        total: selected?.attempts ?? 0,
        pct: selectedValues[index] ?? 0,
        date: formatNight(selected?.occurredAt ?? new Date(), locale),
      }),
    ];
    if (!isFirst) lines.push(t("tooltipFirst", { pct: firstValues[index] ?? 0, date: firstLabel }));
    let top = first;
    for (const night of nights) {
      if (pctOf(night, phase.name) > pctOf(top, phase.name)) top = night;
    }
    lines.push(
      t("tooltipBest", {
        pct: pctOf(top, phase.name),
        date: formatNight(top.occurredAt, locale),
      }),
    );
    return lines.join("\n");
  };

  return (
    <div className="border-line bg-surface mb-6 rounded-sm border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-foreground-strong text-sm font-semibold">{t("title")}</div>
          <p className="text-muted text-xs">{t("description")}</p>
        </div>
        <div className="text-muted-strong flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-3.5 rounded-[2px] border"
              style={{ background: AREA_COLOR, borderColor: SELECTED_COLOR }}
            />
            {t("legendSelected")}
          </span>
          {isFirst ? null : (
            <span className="flex items-center gap-1.5">
              <span className="w-4" style={{ borderTop: `1.5px dashed ${FIRST_COLOR}` }} />
              {t("legendFirst", { date: firstLabel })}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className="w-4"
              style={{ borderTop: `1.25px solid ${OTHER_COLOR}`, opacity: 0.5 }}
            />
            {t("legendOthers")}
          </span>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {nights.map((night) => {
          const values = series(night);
          const depth = values.findLastIndex((v) => v > 0);
          const phase = phases[depth];
          const active = night.id === selected.id;
          return (
            <button
              key={night.id}
              type="button"
              onClick={() => setSelectedId(night.id)}
              aria-pressed={active}
              className={`w-20 rounded-sm border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors ${
                active
                  ? "border-primary bg-primary/15 text-foreground-strong"
                  : "border-line bg-surface-2 text-muted-strong hover:border-muted"
              }`}
            >
              {formatNight(night.occurredAt, locale)}
              <div className="bg-line-soft mt-1 h-[3px] overflow-hidden rounded-full">
                <div
                  className="h-full"
                  style={{
                    width: `${((depth + 1) / phases.length) * 100}%`,
                    background: phase
                      ? readableHeadingColor(phaseColor(bossId, phase.order, phase.name))
                      : "transparent",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex">
        <PlotAxis />
        <div className="relative mt-6 h-[170px] min-w-0 flex-1">
          <PlotGrid />
          {nights
            .filter((n) => n.id !== selected.id && n.id !== first.id)
            .map((n) => (
              <StepSeries
                key={n.id}
                values={series(n)}
                color={OTHER_COLOR}
                width={1.25}
                opacity={0.38}
              />
            ))}
          {isFirst ? null : (
            <StepSeries values={firstValues} color={FIRST_COLOR} width={1.5} dashed />
          )}
          <StepSeries
            values={selectedValues}
            color={SELECTED_COLOR}
            width={2.5}
            fill={AREA_COLOR}
          />
          <div className="absolute inset-0 flex">
            {phases.map((phase, i) => (
              <div key={phase.name} className="relative flex-1" title={tooltip(i)}>
                <span
                  className="text-foreground-strong absolute left-1/2 -translate-x-1/2 text-[11px] font-bold"
                  style={{ bottom: `calc(${selectedValues[i] ?? 0}% + 7px)` }}
                >
                  {selectedValues[i] ?? 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex">
        <div className={GUTTER} />
        <div className="flex min-w-0 flex-1">
          {phases.map((phase) => (
            <div
              key={phase.name}
              className="flex flex-1 flex-col items-center gap-1 pt-2 text-center"
              title={phase.name}
            >
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{
                  background: readableHeadingColor(phaseColor(bossId, phase.order, phase.name)),
                }}
              />
              <span className="text-muted-strong text-[11px] leading-tight">
                {shortPhaseName(phase.name)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isFirst ? null : (
        <div className="border-line-soft bg-surface-2 mt-4 rounded-sm border pb-2">
          <div className="flex items-center gap-2 px-3 pb-2 pt-2.5 text-[11px]">
            <span className="text-muted-strong font-bold uppercase tracking-wide">
              {t("changeTitle")}
            </span>
            <span className="text-muted">
              {t("changeHint", {
                selected: formatNight(selected.occurredAt, locale),
                first: firstLabel,
              })}
            </span>
          </div>
          <div className="flex">
            <div className={GUTTER} />
            <div className="flex min-w-0 flex-1">
              {deltas.map((delta, i) => (
                <div
                  key={phases[i]?.name}
                  className="mx-px flex-1 py-1.5 text-center text-[11px] font-bold"
                  style={deltaStyle(delta)}
                  title={tooltip(i)}
                >
                  {formatDelta(delta)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="border-line-soft text-muted-strong mt-3 border-t pt-3 text-xs">
        {isFirst || best <= 0
          ? null
          : `${t("summaryBest", { date: firstLabel, phase: phases[bestIndex]?.name ?? "", points: best })} `}
        {furthestIndex >= 0
          ? t("summaryFurthest", { phase: phases[furthestIndex]?.name ?? "" })
          : null}
      </p>
    </div>
  );
}
