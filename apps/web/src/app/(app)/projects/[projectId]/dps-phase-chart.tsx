"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { phaseColor, readableHeadingColor } from "@/components/phase-badge";
import { shortPhaseName } from "@/components/phase-progress-shared";
import type { Locale } from "@/i18n/locale";
import {
  FULL_RUNS,
  buildDpsSeries,
  compareSeries,
  percentChange,
  type DamageMetric,
  type DpsNight,
  type DpsPoint,
  type TotalPoint,
} from "@/lib/dps-model";
import { formatDate, formatNumber } from "@/lib/utils";

// The boss-only numbers are what the chart shows. Both kinds are stored, so
// a switch to total damage later only has to change this.
const METRIC: DamageMetric = "bossDamage";

const MAIN = "#c9a8e8";
const FIRST = "#8a8299";
const GOLD = "#e8b84c";
const DANGER = "#e0453d";
const MUTED = "#6b6478";
const PLOT_HEIGHT = 200;
const SVG_WIDTH = 1000;

type Selection = "total" | number;

function formatNight(date: Date, locale: Locale): string {
  return formatDate(date, locale, { day: "2-digit", month: "2-digit" });
}

// "26.07." at the end of a sentence must not become "26.07..".
function sentenceDate(date: Date, locale: Locale): string {
  return formatNight(date, locale).replace(/\.$/, "");
}

function formatDuration(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")} min`;
}

function formatDelta(delta: number): string {
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta} %` : `${delta} %`;
}

function deltaColor(delta: number | null): string {
  if (delta === null || delta === 0) return MUTED;
  return delta > 0 ? GOLD : DANGER;
}

// "Soo-Won 1" -> "SW1", "Purification 4" -> "P4", long names clipped.
function chipName(name: string): string {
  const sooWon = /^Soo-Won (\d+)$/.exec(name);
  return sooWon ? `SW${sooWon[1]}` : shortPhaseName(name);
}

/**
 * Boss DPS of the group per raid night: one chosen phase, or all phases
 * together as a weighted index (see `buildDpsSeries`). Chips pick the phase
 * and show how it changed over time, the dashed line is the first night to
 * compare with, dot size tells how many phase runs a night is based on.
 */
export function DpsPhaseChart({
  bossId,
  phases,
  nights,
}: Readonly<{
  bossId: string;
  /** Phases that count, in fight order. */
  phases: { name: string; order: number }[];
  /** Raid nights, oldest first. */
  nights: DpsNight[];
}>) {
  const t = useTranslations("dpsChart");
  const locale = useLocale() as Locale;
  const [selection, setSelection] = useState<Selection>("total");
  const [nightIndex, setNightIndex] = useState<number | null>(null);

  const nightCount = nights.length;
  const hasData = nights.map((n) => Object.keys(n.phases).length > 0);
  const withData = hasData.flatMap((has, i) => (has ? [i] : []));
  const firstWithData = withData[0];

  if (firstWithData === undefined) {
    return (
      <Card title={t("title")} description={t("description")}>
        <EmptyState title={t("emptyTitle")} text={t("emptyText")} />
      </Card>
    );
  }

  const series = buildDpsSeries(
    phases.map((p) => p.name),
    nights,
    METRIC,
  );
  const phaseOrder = new Map(phases.map((p) => [p.name, p.order]));

  const chips = [
    {
      key: "total" as Selection,
      name: t("chipTotal"),
      fullName: t("chipTotalFull"),
      dot: MAIN,
      points: series.total as DpsPoint[],
    },
    ...series.phases.map((p, i) => ({
      key: i as Selection,
      name: chipName(p.name),
      fullName: p.name,
      dot: readableHeadingColor(phaseColor(bossId, phaseOrder.get(p.name) ?? i, p.name)),
      points: p.points,
    })),
  ];
  const comparisons = chips.map((c) => compareSeries(c.points));
  const enabled = chips.map(
    (c, j) => c.points.some((p) => p.v !== null) && (j === 0 || !!comparisons[j]),
  );

  let selectedChip = chips.findIndex((c) => c.key === selection);
  if (selectedChip < 0 || !enabled[selectedChip]) selectedChip = enabled.indexOf(true);
  if (selectedChip < 0) {
    return (
      <Card title={t("title")} description={t("description")}>
        <EmptyState title={t("emptyFewTitle")} text={t("emptyFewText")} />
      </Card>
    );
  }

  const isTotal = selectedChip === 0;
  const chip = chips[selectedChip]!;
  const points = chip.points;
  const comparison = comparisons[selectedChip] ?? null;

  const scaleLabel = (v: number) => `${Math.round(v / 1000)}k`;
  const full = (v: number) => formatNumber(Math.round(v), locale);

  // Y range in k, with some air, on a 10k grid and an even number of steps so
  // the middle tick sits on a whole number.
  const plotValues = points.flatMap((p) => (p.v === null ? [] : [p.v / 1000]));
  if (isTotal) {
    for (const p of series.phases) {
      for (const q of p.points) {
        if (q.full && q.v !== null && p.mean)
          plotValues.push(((q.v / p.mean) * series.reference) / 1000);
      }
    }
  }
  const min = Math.min(...plotValues);
  const max = Math.max(...plotValues);
  const pad = Math.max(6, (max - min) * 0.18);
  const lo = Math.floor((min - pad) / 10) * 10;
  let hi = Math.ceil((max + pad) / 10) * 10;
  if ((hi - lo) % 20) hi += 10;
  const yFrac = (v: number) => 1 - (v / 1000 - lo) / (hi - lo);
  const xFrac = (i: number) => (i + 0.5) / nightCount;
  const px = (i: number) => (xFrac(i) * SVG_WIDTH).toFixed(1);
  const py = (v: number) => (yFrac(v) * PLOT_HEIGHT).toFixed(1);

  let solid = "";
  let dashed = "";
  for (let i = 1; i < nightCount; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a?.v == null || b?.v == null) continue;
    const segment = `M${px(i - 1)},${py(a.v)} L${px(i)},${py(b.v)} `;
    if (a.full && b.full) solid += segment;
    else dashed += segment;
  }

  // Every phase as a faint line next to the weighted index, each scaled
  // by its own baseline so they share the index's axis.
  let background = "";
  if (isTotal) {
    for (const p of series.phases) {
      if (!p.mean) continue;
      for (let i = 1; i < nightCount; i++) {
        const a = p.points[i - 1];
        const b = p.points[i];
        if (!a?.full || !b?.full || a.v === null || b.v === null) continue;
        background += `M${px(i - 1)},${py((a.v / p.mean) * series.reference)} L${px(i)},${py((b.v / p.mean) * series.reference)} `;
      }
    }
  }

  const plotted = points.flatMap((p, i) => (p.v === null ? [] : [i]));
  const fullIndices = plotted.filter((i) => points[i]?.full);
  const lastIndex = plotted[plotted.length - 1]!;
  const selectedNight = nightIndex ?? lastIndex;
  const showBase = fullIndices.length >= 2;
  const baseIndex = fullIndices[0] ?? lastIndex;
  const baseValue = points[baseIndex]?.v ?? 0;
  const bestIndex = fullIndices.reduce(
    (best, i) => ((points[i]?.v ?? 0) > (points[best]?.v ?? 0) ? i : best),
    baseIndex,
  );
  const sizeScale = isTotal ? 60 : 15;

  const night = (i: number) => nights[i]!;
  const date = (i: number) => formatNight(night(i).occurredAt, locale);
  const dateRange = (indices: number[]) =>
    indices.length > 1
      ? `${date(indices[0]!)}–${date(indices[indices.length - 1]!)}`
      : date(indices[0]!);

  const point = points[selectedNight]!;
  const rows: { label: string; value: string; color: string }[] = [];
  if (point.v === null) {
    rows.push({
      label: t("rowStatus"),
      value: hasData[selectedNight] ? t("statusFew") : t("statusNone"),
      color: "#9c93b0",
    });
  } else {
    rows.push({
      label: isTotal ? t("rowDpsWeighted") : t("rowDps"),
      value: full(point.v),
      color: "#ede9f5",
    });
    if (showBase) {
      if (selectedNight === baseIndex) {
        rows.push({ label: t("rowFirst"), value: t("rowFirstThis"), color: "#9c93b0" });
      } else {
        const delta = percentChange(point.v, baseValue);
        rows.push({
          label: t("rowFirst"),
          value: `${full(baseValue)} (${formatDelta(delta)})`,
          color: deltaColor(delta),
        });
      }
    }
    if (fullIndices.length > 0) {
      rows.push({
        label: t("rowBest"),
        value: `${full(points[bestIndex]?.v ?? 0)} (${date(bestIndex)})`,
        color: "#ede9f5",
      });
    }
    rows.push({
      label: t("rowBasis"),
      value: isTotal
        ? t("basisTotal", {
            phases: (point as TotalPoint).includedPhases,
            runs: point.runs,
            time: formatDuration(point.secs),
          })
        : t("basisPhase", { runs: point.runs, time: formatDuration(point.secs) }),
      color: "#ede9f5",
    });
    if (!point.full) rows.push({ label: t("rowHint"), value: t("hintFew"), color: GOLD });
    const low = isTotal ? (point as TotalPoint).lowPhases : [];
    if (low.length > 0) {
      rows.push({
        label: t("rowLow"),
        value: low.map((p) => `${chipName(p.name)} (${p.runs}×)`).join(", "),
        color: "#9c93b0",
      });
    }
  }

  const current = full(points[lastIndex]?.v ?? 0);
  let summary: string;
  if (!comparison) {
    summary = t("summaryNoCompare", {
      name: chip.fullName,
      date: sentenceDate(night(firstWithData).occurredAt, locale),
      value: current,
      weighted: isTotal ? t("weightedSuffix") : "",
    });
  } else if (isTotal) {
    const best = chips
      .slice(1)
      .flatMap((c, j) => {
        const cmp = comparisons[j + 1];
        return cmp ? [{ name: c.fullName, delta: cmp.delta }] : [];
      })
      .sort((a, b) => b.delta - a.delta)[0];
    const since = t("summaryTotal", {
      delta: formatDelta(comparison.delta),
      date: sentenceDate(night(comparison.from[0]!).occurredAt, locale),
    });
    summary = best
      ? `${since} ${t("summaryBestPhase", { phase: best.name, delta: formatDelta(best.delta) })} ${t("summaryCurrentWeighted", { value: current })}`
      : `${since} ${t("summaryCurrentWeighted", { value: current })}`;
  } else {
    summary = t("summaryPhase", {
      name: chip.fullName,
      delta: formatDelta(comparison.delta),
      date: sentenceDate(night(comparison.from[0]!).occurredAt, locale),
      best: full(points[bestIndex]?.v ?? 0),
      bestDate: date(bestIndex),
      value: current,
    });
  }

  const firstLegendDate = date(baseIndex);
  let baseLegend = "";
  if (showBase) {
    if (baseIndex === firstWithData) {
      baseLegend =
        firstWithData > 0
          ? t("legendFirstWithData", { date: firstLegendDate })
          : t("legendFirst", { date: firstLegendDate });
    } else {
      baseLegend = t("legendFirstEnough", { date: firstLegendDate });
    }
  }

  return (
    <Card
      title={t("title")}
      description={t("description")}
      legend={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <LegendItem>
            <span className="w-3.5" style={{ borderTop: `2.5px solid ${MAIN}` }} />
            {isTotal ? t("legendMainWeighted") : t("legendMain")}
          </LegendItem>
          {showBase ? (
            <LegendItem>
              <span className="w-3.5" style={{ borderTop: `2px dashed ${FIRST}` }} />
              {baseLegend}
            </LegendItem>
          ) : null}
          <LegendItem>
            <span className="size-1.5 rounded-full opacity-45" style={{ background: MAIN }} />
            <span className="size-[11px] rounded-full" style={{ background: MAIN }} />
            {t("legendSize")}
          </LegendItem>
          <LegendItem>
            <span
              className="box-border size-[9px] rounded-full"
              style={{ border: `1.5px solid ${MAIN}` }}
            />
            {t("legendHollow", { count: FULL_RUNS })}
          </LegendItem>
        </div>
      }
    >
      <div className="mb-[18px] grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {chips.map((c, j) => {
          const active = j === selectedChip;
          const cmp = comparisons[j];
          let title: string;
          if (!enabled[j]) title = t("chipTitleNoData", { phase: c.fullName });
          else if (cmp) {
            title = t("chipTitleCompare", {
              phase: c.fullName,
              delta: formatDelta(cmp.delta),
              from: dateRange(cmp.from),
              to: dateRange(cmp.to),
            });
          } else title = t("chipTitleNone", { phase: c.fullName });
          return (
            <button
              key={String(c.key)}
              type="button"
              disabled={!enabled[j]}
              aria-pressed={active}
              title={title}
              onClick={() => {
                setSelection(c.key);
                setNightIndex(null);
              }}
              className="flex min-w-0 flex-col items-center gap-1 rounded-[3px] border px-1.5 pb-[7px] pt-2 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: active ? "rgba(139,47,209,0.18)" : "#0f0d18",
                borderColor: active ? "#8b2fd1" : "#251f35",
              }}
            >
              <span className="flex min-w-0 items-center gap-1">
                <span className="size-[7px] shrink-0 rounded-[2px]" style={{ background: c.dot }} />
                <span
                  className="truncate text-[10.5px] font-semibold"
                  style={{ color: active ? "#ede9f5" : "#9c93b0" }}
                >
                  {c.name}
                </span>
                {j === 0 ? (
                  <span
                    title={t("totalInfo")}
                    className="box-border flex size-[11px] shrink-0 cursor-help items-center justify-center rounded-full border border-[#8a8299] text-[8px] font-bold leading-none text-[#8a8299]"
                  >
                    i
                  </span>
                ) : null}
              </span>
              <span
                className="text-[10.5px] font-bold"
                style={{ color: deltaColor(cmp?.delta ?? null) }}
              >
                {cmp ? formatDelta(cmp.delta) : "–"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-2">
        <div className="relative" style={{ height: PLOT_HEIGHT }}>
          {[hi, (hi + lo) / 2, lo].map((v, i) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2 text-[10px] text-[#524b66]"
              style={{ top: `${i * 50}%` }}
            >
              {v}k
            </span>
          ))}
        </div>
        <div className="relative" style={{ height: PLOT_HEIGHT }}>
          <div className="absolute inset-x-0 top-0 border-t border-[#211d30]" />
          <div className="absolute inset-x-0 top-1/2 border-t border-[#211d30]" />
          <div className="absolute inset-x-0 bottom-0 border-t border-[#2a2438]" />
          {showBase ? (
            <div
              className="absolute inset-x-0"
              style={{ top: `${yFrac(baseValue) * 100}%`, borderTop: "1.5px dashed #6b6478" }}
            />
          ) : null}
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${nightCount}, minmax(0, 1fr))` }}
          >
            {nights.map((n, i) => (
              <button
                key={n.id}
                type="button"
                aria-label={date(i)}
                onClick={() => setNightIndex(i)}
                className="cursor-pointer hover:bg-[rgba(237,233,245,0.05)]"
                style={{
                  background: i === selectedNight ? "rgba(237,233,245,0.07)" : "transparent",
                }}
              />
            ))}
          </div>
          <svg
            width="100%"
            height={PLOT_HEIGHT}
            viewBox={`0 0 ${SVG_WIDTH} ${PLOT_HEIGHT}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            <path
              d={background}
              fill="none"
              stroke="rgba(139,47,209,0.35)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={dashed.trim()}
              fill="none"
              stroke={MAIN}
              strokeWidth="2"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={solid.trim()}
              fill="none"
              stroke={MAIN}
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {plotted.map((i) => {
            const p = points[i]!;
            const weight = Math.min(1, p.runs / sizeScale);
            const isLast = i === lastIndex;
            const size = 6 + weight * 8 + (isLast ? 2 : 0);
            return (
              <div
                key={nights[i]!.id}
                className="pointer-events-none absolute box-border -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${xFrac(i) * 100}%`,
                  top: `${yFrac(p.v ?? 0) * 100}%`,
                  width: size,
                  height: size,
                  background: p.full ? MAIN : "#15121f",
                  border: p.full ? "0 solid transparent" : `1.5px solid ${MAIN}`,
                  opacity: p.full ? (isLast ? 1 : 0.45 + weight * 0.55) : 0.85,
                  boxShadow: isLast ? "0 0 0 3px rgba(201,168,232,0.28)" : "none",
                }}
              />
            );
          })}
          <div
            className="pointer-events-none absolute whitespace-nowrap text-[11.5px] font-bold text-[#ede9f5]"
            style={{
              left: `${xFrac(lastIndex) * 100}%`,
              top: `${yFrac(points[lastIndex]?.v ?? 0) * 100}%`,
              transform: "translate(-50%, -190%)",
            }}
          >
            {scaleLabel(points[lastIndex]?.v ?? 0)}
          </div>
          <div
            className="pointer-events-none absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${nightCount}, minmax(0, 1fr))` }}
          >
            {points.map((p, i) => (
              <div key={nights[i]!.id} className="flex items-end justify-center pb-1.5">
                {p.v === null ? (
                  <span
                    title={`${date(i)} · ${hasData[i] ? t("gapFew") : t("gapNone")}`}
                    className="pointer-events-auto box-border flex size-3.5 cursor-help items-center justify-center rounded-full border-[1.5px] border-[#6b6478] bg-[#15121f] text-[9px] font-bold leading-none text-[#8a8299]"
                  >
                    ?
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div />
        <div
          className="grid pt-2"
          style={{ gridTemplateColumns: `repeat(${nightCount}, minmax(0, 1fr))` }}
        >
          {points.map((p, i) => (
            <div key={nights[i]!.id} className="flex flex-col items-center gap-0.5">
              <span className="text-[10.5px] text-[#9c93b0]">{date(i)}</span>
              <span className="text-[10px]" style={{ color: p.v === null ? MUTED : "#524b66" }}>
                {p.v === null ? "–" : `${p.runs}×`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {withData.length < nightCount ? (
        <p className="mt-2.5 text-[11.5px] text-[#6b6478]">
          {t("note", { count: nightCount - withData.length })}
        </p>
      ) : null}

      <div className="mt-4 rounded-sm border border-[#251f35] bg-[#0f0d18] px-4 py-3">
        <div className="mb-2 text-[12.5px] font-semibold text-[#ede9f5]">
          {date(selectedNight)} · {chip.fullName}
        </div>
        <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-[18px] gap-y-1">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <div className="text-[11.5px] text-[#6b6478]">{r.label}</div>
              <div className="text-xs font-semibold" style={{ color: r.color }}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3.5 border-t border-[#211d30] pt-3 text-xs leading-normal text-[#9c93b0]">
        {summary}
      </p>
    </Card>
  );
}

function Card({
  title,
  description,
  legend,
  children,
}: Readonly<{
  title: string;
  description: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <div className="border-line bg-surface mb-[18px] rounded-sm border px-[22px] pb-4 pt-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="text-foreground-strong text-sm font-semibold">{title}</div>
          <p className="text-muted mt-[3px] text-xs">{description}</p>
        </div>
        {legend}
      </div>
      {children}
    </div>
  );
}

function LegendItem({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex items-center gap-1.5 text-[11px] text-[#9c93b0]">{children}</div>;
}

function EmptyState({ title, text }: Readonly<{ title: string; text: string }>) {
  return (
    <div className="rounded-sm border border-dashed border-[#3a3250] bg-[#0f0d18] px-5 py-11 text-center">
      <div
        className="mx-auto mb-3 size-[26px] bg-[#3a3250]"
        style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
      />
      <div className="mb-1.5 text-[13.5px] font-semibold text-[#c9c3d6]">{title}</div>
      <div className="mx-auto max-w-[440px] text-pretty text-xs leading-relaxed text-[#6b6478]">
        {text}
      </div>
    </div>
  );
}
