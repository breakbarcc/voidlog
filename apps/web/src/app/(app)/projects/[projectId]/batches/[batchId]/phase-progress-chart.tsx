"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { phaseColor, readableHeadingColor } from "@/components/phase-badge";

export interface PhaseProgressStat {
  name: string;
  order: number;
  reached: number;
  total: number;
}

const config: ChartConfig = { pct: { label: "%" } };

/**
 * How many percent of the attempts reached each main phase. A group that gets
 * more stable shows up as the bars of the later phases growing towards the
 * first one.
 */
export function PhaseProgressChart({
  bossId,
  stats,
}: Readonly<{ bossId: string; stats: PhaseProgressStat[] }>) {
  const t = useTranslations("batchAttempts.progress");
  const data = stats.map((s) => ({
    name: s.name,
    reached: s.reached,
    total: s.total,
    pct: s.total > 0 ? Math.round((s.reached / s.total) * 100) : 0,
    color: readableHeadingColor(phaseColor(bossId, s.order, s.name)),
  }));

  return (
    <div className="border-line bg-surface mb-5 rounded-sm border p-4">
      <div className="text-muted-strong text-sm font-semibold">{t("title")}</div>
      <p className="text-muted mb-3 text-xs">{t("description")}</p>
      <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel={false}
                formatter={(_value, _name, item) => {
                  const p = item.payload as (typeof data)[number];
                  return t("tooltip", { reached: p.reached, total: p.total, pct: p.pct });
                }}
              />
            }
          />
          <Bar dataKey="pct" radius={[3, 3, 0, 0]} maxBarSize={64}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
            <LabelList
              dataKey="pct"
              position="top"
              formatter={(v: unknown) => `${v}%`}
              className="fill-foreground text-[11px]"
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
