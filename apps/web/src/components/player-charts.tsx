"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** Chart-ready attempt (plain data, serializable from the server page). */
export interface PlayerChartPoint {
  /** x-axis label: the attempt number (batch page) or the night (project page). */
  label: string;
  dps: number | null;
  revealCount: number | null;
  debilitatedCount: number | null;
  /** Hit share in percent of the shockwaves played; null when none were played. */
  shockwaveRate: number | null;
  shockwavesPlayed: number | null;
  shockwavesHit: number | null;
  /**
   * Share in percent of the player's Greens they weren't in their circle
   * (lib/green-player-stats.ts); null when their role had none. Only on the
   * project page.
   */
  greensRate?: number | null;
  greensExpected?: number | null;
  greensMissed?: number | null;
}

const CHART_HEIGHT = "aspect-auto h-[180px] w-full";
const MARGIN = { left: 0, right: 8, top: 8, bottom: 0 };

function Axes({
  formatTick,
  allowDecimals = false,
}: Readonly<{ formatTick?: (v: number) => string; allowDecimals?: boolean }>) {
  return (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="label"
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
        allowDecimals={allowDecimals}
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
        <ChartTooltip content={<ChartTooltipContent />} />
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
      <LineChart data={points} margin={MARGIN}>
        <Axes allowDecimals />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="revealCount"
          type="monotone"
          stroke="var(--color-revealCount)"
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
          dot={{ r: 3, fill: "var(--color-revealCount)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function PlayerDebilitatedChart({ points }: Readonly<{ points: PlayerChartPoint[] }>) {
  const t = useTranslations("playerDetail");
  const config: ChartConfig = {
    debilitatedCount: { label: t("charts.debilitated"), color: "var(--accent)" },
  };
  return (
    <ChartContainer config={config} className={CHART_HEIGHT}>
      <LineChart data={points} margin={MARGIN}>
        <Axes allowDecimals />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="debilitatedCount"
          type="monotone"
          stroke="var(--color-debilitatedCount)"
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
          dot={{ r: 3, fill: "var(--color-debilitatedCount)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function PlayerShockwaveChart({ points }: Readonly<{ points: PlayerChartPoint[] }>) {
  const t = useTranslations("playerDetail");
  const config: ChartConfig = {
    shockwaveRate: { label: t("charts.shockwavesHit"), color: "var(--danger)" },
  };
  return (
    <ChartContainer config={config} className={CHART_HEIGHT}>
      <LineChart data={points} margin={MARGIN}>
        <Axes formatTick={(v) => `${v}%`} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const p = item?.payload as PlayerChartPoint | undefined;
                return p?.shockwavesPlayed == null
                  ? `${String(value)}%`
                  : `${String(value)}% (${p.shockwavesHit}/${p.shockwavesPlayed})`;
              }}
            />
          }
        />
        <Line
          dataKey="shockwaveRate"
          type="monotone"
          stroke="var(--color-shockwaveRate)"
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
          dot={{ r: 3, fill: "var(--color-shockwaveRate)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function PlayerGreensChart({ points }: Readonly<{ points: PlayerChartPoint[] }>) {
  const t = useTranslations("playerDetail");
  const config: ChartConfig = {
    greensRate: { label: t("charts.greensMissed"), color: "var(--danger)" },
  };
  return (
    <ChartContainer config={config} className={CHART_HEIGHT}>
      <LineChart data={points} margin={MARGIN}>
        <Axes formatTick={(v) => `${v}%`} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const p = item?.payload as PlayerChartPoint | undefined;
                return p?.greensExpected == null
                  ? `${String(value)}%`
                  : `${String(value)}% (${p.greensMissed}/${p.greensExpected})`;
              }}
            />
          }
        />
        <Line
          dataKey="greensRate"
          type="monotone"
          stroke="var(--color-greensRate)"
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
          dot={{ r: 3, fill: "var(--color-greensRate)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
