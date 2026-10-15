"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useLocale, useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Locale } from "@/i18n/locale";
import { formatDate } from "@/lib/utils";

export interface TrendPoint {
  id: string;
  occurredAt: Date;
  greenFailRate: number | null;
  /** Greens casts of the night / of those, the failed ones. */
  greensCast: number;
  greensFailed: number;
  shockwaveHitRate: number | null;
  /** Shockwaves of the night / of those, the failed ones. */
  shockwavesPlayed: number;
  shockwavesHit: number;
}

function formatAxisDate(date: Date, locale: Locale): string {
  return formatDate(date, locale, { day: "2-digit", month: "2-digit" });
}

function SingleLineChart({
  points,
  dataKey,
  valueOf,
  countOf,
  color,
  label,
  formatValue,
  formatTick = formatValue,
}: Readonly<{
  points: TrendPoint[];
  dataKey: string;
  /** null = no value for this night: the x-axis keeps the date, the line shows a gap. */
  valueOf: (p: TrendPoint) => number | null;
  /** The absolute numbers behind the rate, shown as `x/y` in the tooltip. */
  countOf: (p: TrendPoint) => { part: number; total: number };
  color: string;
  label: string;
  formatValue: (v: number) => string;
  formatTick?: (v: number) => string;
}>) {
  const locale = useLocale() as Locale;
  const data = points.map((p) => ({
    date: formatAxisDate(p.occurredAt, locale),
    [dataKey]: valueOf(p),
    counts: countOf(p),
  }));

  const config: ChartConfig = {
    [dataKey]: { label, color },
  };

  return (
    <ChartContainer config={config} className="aspect-auto h-[160px] w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => formatTick(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const counts = (item?.payload as { counts?: { part: number; total: number } })
                  ?.counts;
                return counts
                  ? `${formatValue(Number(value))} (${counts.part}/${counts.total})`
                  : formatValue(Number(value));
              }}
            />
          }
        />
        <Line
          dataKey={dataKey}
          type="monotone"
          stroke={`var(--color-${dataKey})`}
          strokeWidth={2}
          connectNulls={false}
          // The draw-in animation restarts whenever the chart re-renders and was
          // seen stuck at its first frame (line invisible) — draw the line outright.
          isAnimationActive={false}
          // A night between two gaps has no line segment to carry it, so
          // it gets a dot of its own; connected nights stay dot-free.
          dot={(props: { index?: number; cx?: number; cy?: number; payload?: unknown }) => {
            const i = props.index ?? 0;
            const key = `${dataKey}-dot-${i}`;
            const value = (props.payload as Record<string, number | null> | undefined)?.[dataKey];
            const isolated = data[i - 1]?.[dataKey] == null && data[i + 1]?.[dataKey] == null;
            if (value == null || !isolated || props.cx == null || props.cy == null) {
              return <g key={key} />;
            }
            return (
              <circle
                key={key}
                cx={props.cx}
                cy={props.cy}
                r={3}
                fill={`var(--color-${dataKey})`}
              />
            );
          }}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function GreenFailTrendChart({ points }: Readonly<{ points: TrendPoint[] }>) {
  const t = useTranslations("trendChart");
  return (
    <SingleLineChart
      points={points}
      dataKey="greenFail"
      valueOf={(p) => p.greenFailRate}
      countOf={(p) => ({ part: p.greensFailed, total: p.greensCast })}
      color="var(--danger)"
      label={t("greenFailRate")}
      formatValue={(v) => `${Math.round(v)}%`}
    />
  );
}

export function ShockwaveTrendChart({ points }: Readonly<{ points: TrendPoint[] }>) {
  const t = useTranslations("trendChart");
  return (
    <SingleLineChart
      points={points}
      dataKey="shockwave"
      valueOf={(p) => p.shockwaveHitRate}
      countOf={(p) => ({ part: p.shockwavesHit, total: p.shockwavesPlayed })}
      color="var(--warning)"
      label={t("shockwaveRate")}
      formatValue={(v) => `${Math.round(v)}%`}
    />
  );
}
