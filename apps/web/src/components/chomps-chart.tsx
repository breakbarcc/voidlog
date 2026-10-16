"use client";

import { useState } from "react";
import { Card, Switch } from "@radix-ui/themes";
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
  slam: number | null;
  jaws: number | null;
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

  const data = points.map((p) => ({
    label: p.label,
    chomps: p.slam === null ? null : Math.round((p.slam + (withJaws ? (p.jaws ?? 0) : 0)) * 100) / 100,
  }));
  const config: ChartConfig = {
    chomps: { label: t("series"), color: "var(--danger)" },
  };

  return (
    <Card size="3" className="border-line bg-surface border">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="text-muted-strong text-xs font-medium uppercase tracking-wide">{title}</div>
        <label className="text-muted flex shrink-0 items-center gap-2 text-xs">
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
          <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={unit === "average"} />
          <ChartTooltip content={<ChartTooltipContent />} />
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
