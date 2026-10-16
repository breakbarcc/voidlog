"use client";

import { useState } from "react";
import { Card, SegmentedControl, Switch } from "@radix-ui/themes";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** One x-axis position of the chomps chart; null = nothing to count there (a gap). */
export interface ChompChartPoint {
  label: string;
  /** Average Slam / Jaws kills per attempt that reached the attacks. */
  slam: number | null;
  jaws: number | null;
  /**
   * Attempts with at least one Slam kill / one Slam or Jaws kill, out of
   * `reached` attempts that got to the attacks. Present = the "attempts"
   * metric is offered.
   */
  attemptsSlam?: number;
  attemptsAny?: number;
  reached?: number;
}

/**
 * Primordus Chomps over time: Lava Slam kills, optionally plus Jaws of
 * Destruction kills (on by default). Lives in its own card because the switch
 * belongs to the chart.
 */
export function ChompsChartCard({
  title,
  points,
  unit = "count",
}: Readonly<{
  title: string;
  points: ChompChartPoint[];
  /** What a point's value means: a plain count or an average per attempt. */
  unit?: "count" | "average";
}>) {
  const t = useTranslations("chomps");
  const [withJaws, setWithJaws] = useState(true);
  const hasAttempts = points.some((p) => p.attemptsAny !== undefined);
  const [metric, setMetric] = useState<"attempts" | "average">("attempts");
  const showAttempts = hasAttempts && metric === "attempts";

  const data = points.map((p) => {
    let chomps: number | null = null;
    if (p.slam !== null) {
      chomps = showAttempts
        ? ((withJaws ? p.attemptsAny : p.attemptsSlam) ?? 0)
        : Math.round((p.slam + (withJaws ? (p.jaws ?? 0) : 0)) * 100) / 100;
    }
    return { label: p.label, chomps, reached: p.reached };
  });
  const config: ChartConfig = {
    chomps: { label: showAttempts ? t("seriesAttempts") : t("series"), color: "var(--danger)" },
  };

  return (
    <Card size="3" className="border-line bg-surface border">
      <div className="mb-3.5 space-y-2">
        <div className="text-muted-strong text-xs font-medium uppercase tracking-wide">{title}</div>
        {hasAttempts ? (
          <SegmentedControl.Root
            size="1"
            value={metric}
            onValueChange={(v) => setMetric(v as "attempts" | "average")}
          >
            <SegmentedControl.Item value="attempts">{t("metricAttempts")}</SegmentedControl.Item>
            <SegmentedControl.Item value="average">{t("metricAverage")}</SegmentedControl.Item>
          </SegmentedControl.Root>
        ) : null}
        <label className="text-muted flex w-fit items-center gap-2 text-xs">
          <Switch size="1" checked={withJaws} onCheckedChange={setWithJaws} />
          {t("includeJaws")}
        </label>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={!showAttempts && unit === "average"} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => {
                  const reached = (item?.payload as { reached?: number } | undefined)?.reached;
                  return showAttempts && reached !== undefined
                    ? t("ofAttempts", { value: Number(value), total: reached })
                    : String(value);
                }}
              />
            }
          />
          <Line
            dataKey="chomps"
            type="monotone"
            stroke="var(--color-chomps)"
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
            dot={{ r: 3, fill: "var(--color-chomps)" }}
          />
        </LineChart>
      </ChartContainer>
    </Card>
  );
}
