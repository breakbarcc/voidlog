"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** Chart-ready attempt (plain data, serializable from the server page). */
export interface PlayerChartPoint {
  n: number;
  dps: number | null;
  revealCount: number | null;
  shockwavesPlayed: number | null;
  shockwavesHit: number | null;
}

const CHART_HEIGHT = "aspect-auto h-[180px] w-full";
const MARGIN = { left: 0, right: 8, top: 8, bottom: 0 };

function Axes({ formatTick }: Readonly<{ formatTick?: (v: number) => string }>) {
  return (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="n"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        interval="preserveStartEnd"
        minTickGap={12}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={44}
        allowDecimals={false}
        tickFormatter={formatTick}
      />
    </>
  );
}

export function PlayerDpsChart({ points }: Readonly<{ points: PlayerChartPoint[] }>) {
  const t = useTranslations("playerDetail");
  const config: ChartConfig = { dps: { label: t("charts.dps"), color: "var(--primary)" } };
  return (
    <ChartContainer config={config} className={CHART_HEIGHT}>
      <LineChart data={points} margin={MARGIN}>
        <Axes />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(n) => `#${String(n)}`} />} />
        <Line
          dataKey="dps"
          type="monotone"
          stroke="var(--color-dps)"
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
          dot={{ r: 3, fill: "var(--color-dps)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function PlayerRevealChart({ points }: Readonly<{ points: PlayerChartPoint[] }>) {
  const t = useTranslations("playerDetail");
  const config: ChartConfig = {
    revealCount: { label: t("charts.reveals"), color: "var(--warning)" },
  };
  return (
    <ChartContainer config={config} className={CHART_HEIGHT}>
      <BarChart data={points} margin={MARGIN}>
        <Axes />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(n) => `#${String(n)}`} />} />
        <Bar dataKey="revealCount" fill="var(--color-revealCount)" radius={2} />
      </BarChart>
    </ChartContainer>
  );
}

export function PlayerShockwaveChart({ points }: Readonly<{ points: PlayerChartPoint[] }>) {
  const t = useTranslations("playerDetail");
  const config: ChartConfig = {
    shockwavesHit: { label: t("charts.shockwavesHit"), color: "var(--danger)" },
  };
  return (
    <ChartContainer config={config} className={CHART_HEIGHT}>
      <BarChart data={points} margin={MARGIN}>
        <Axes />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(n) => `#${String(n)}`}
              formatter={(value, _name, item) => {
                const played = (item?.payload as PlayerChartPoint | undefined)?.shockwavesPlayed;
                return played == null ? String(value) : `${String(value)}/${played}`;
              }}
            />
          }
        />
        <Bar dataKey="shockwavesHit" fill="var(--color-shockwavesHit)" radius={2} />
      </BarChart>
    </ChartContainer>
  );
}
