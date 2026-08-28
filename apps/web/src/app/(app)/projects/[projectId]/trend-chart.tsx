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
import { formatDate, formatNumber } from "@/lib/utils";

export interface TrendPoint {
  id: string;
  occurredAt: Date;
  avgGroupDps: number;
  greenFailRate: number | null;
  shockwaveHitRate: number | null;
}

function formatAxisDate(date: Date, locale: Locale): string {
  return formatDate(date, locale, { day: "2-digit", month: "2-digit" });
}

function SingleLineChart({
  points,
  dataKey,
  valueOf,
  color,
  label,
  formatValue,
}: Readonly<{
  points: TrendPoint[];
  dataKey: string;
  valueOf: (p: TrendPoint) => number;
  color: string;
  label: string;
  formatValue: (v: number) => string;
}>) {
  const locale = useLocale() as Locale;
  const data = points.map((p) => ({
    date: formatAxisDate(p.occurredAt, locale),
    [dataKey]: valueOf(p),
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
          tickFormatter={(v: number) => formatValue(v)}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatValue(Number(value))} />}
        />
        <Line
          dataKey={dataKey}
          type="monotone"
          stroke={`var(--color-${dataKey})`}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function DpsTrendChart({ points }: Readonly<{ points: TrendPoint[] }>) {
  const t = useTranslations("trendChart");
  const locale = useLocale() as Locale;
  return (
    <SingleLineChart
      points={points}
      dataKey="dps"
      valueOf={(p) => p.avgGroupDps}
      color="var(--primary)"
      label={t("avgGroupDps")}
      formatValue={(v) => formatNumber(Math.round(v), locale)}
    />
  );
}

export function GreenFailTrendChart({ points }: Readonly<{ points: TrendPoint[] }>) {
  const t = useTranslations("trendChart");
  return (
    <SingleLineChart
      points={points}
      dataKey="greenFail"
      valueOf={(p) => p.greenFailRate ?? 0}
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
      valueOf={(p) => p.shockwaveHitRate ?? 0}
      color="var(--warning)"
      label={t("shockwaveRate")}
      formatValue={(v) => `${Math.round(v)}%`}
    />
  );
}
