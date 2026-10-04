"use client";

import { useTranslations } from "next-intl";
import { phaseColor, readableHeadingColor } from "@/components/phase-badge";
import {
  AREA_COLOR,
  DASH_COLOR,
  GUTTER,
  LINE_COLOR,
  PlotAxis,
  PlotGrid,
  Riser,
  percent,
  shortPhaseName,
} from "@/components/phase-progress-shared";

export interface PhaseProgressStat {
  name: string;
  order: number;
  reached: number;
  total: number;
}

/** How many attempts of the batch before this one reached each phase. */
export interface PreviousPhaseProgress {
  batchLabel: string;
  stats: Record<string, { reached: number; total: number }>;
}

function Legend({ hasPrevious }: Readonly<{ hasPrevious: boolean }>) {
  const t = useTranslations("batchAttempts.progress");
  return (
    <div className="text-muted-strong flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
      <span className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-3.5 rounded-[2px] border"
          style={{ background: AREA_COLOR, borderColor: LINE_COLOR }}
        />
        {t("legendReached")}
      </span>
      {hasPrevious ? (
        <span className="flex items-center gap-1.5">
          <span className="w-4" style={{ borderTop: `1.5px dashed ${DASH_COLOR}` }} />
          {t("legendPrevious")}
        </span>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span className="bg-danger h-2.5 w-2.5 rounded-[2px]" />
        {t("legendWipes")}
      </span>
    </div>
  );
}

/**
 * How many percent of the attempts reached each main phase (step area), the
 * same for the batch before it (dashed), and below it where the attempts
 * ended. A group that gets more stable shows the later phases catching up
 * with the first ones.
 */
export function PhaseProgressChart({
  bossId,
  stats,
  wipesByPhase,
  attempts,
  previous,
}: Readonly<{
  bossId: string;
  stats: PhaseProgressStat[];
  /** Number of failed attempts whose furthest main phase was this one. */
  wipesByPhase: Record<string, number>;
  attempts: number;
  previous: PreviousPhaseProgress | null;
}>) {
  const t = useTranslations("batchAttempts.progress");
  const columns = stats.map((s) => {
    const prev = previous?.stats[s.name];
    return {
      ...s,
      pct: percent(s.reached, s.total),
      prevPct: prev ? percent(prev.reached, prev.total) : null,
      wipes: wipesByPhase[s.name] ?? 0,
      color: readableHeadingColor(phaseColor(bossId, s.order, s.name)),
    };
  });
  const maxWipes = Math.max(0, ...columns.map((c) => c.wipes));
  const worst = maxWipes > 0 ? columns.find((c) => c.wipes === maxWipes) : undefined;
  const hasPrevious = columns.some((c) => c.prevPct !== null);

  function tooltip(c: (typeof columns)[number]): string {
    const lines = [c.name, t("tooltip", { reached: c.reached, total: c.total, pct: c.pct })];
    if (c.prevPct !== null && previous) {
      lines.push(t("tooltipPrevious", { label: previous.batchLabel, pct: c.prevPct }));
    }
    lines.push(t("tooltipWipes", { count: c.wipes }));
    return lines.join("\n");
  }

  return (
    <div className="border-line bg-surface mb-5 rounded-sm border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-foreground-strong text-sm font-semibold">{t("title")}</div>
          <p className="text-muted text-xs">{t("description")}</p>
        </div>
        <Legend hasPrevious={hasPrevious} />
      </div>

      <div className="flex">
        <PlotAxis />
        <div className="relative mt-6 h-[170px] min-w-0 flex-1">
          <PlotGrid />
          <div className="absolute inset-0 flex">
            {columns.map((c, i) => {
              const before = columns[i - 1];
              return (
                <div key={c.name} className="relative flex-1" title={tooltip(c)}>
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{ height: `${c.pct}%`, background: AREA_COLOR }}
                  />
                  {c.prevPct === null ? null : (
                    <>
                      <div
                        className="absolute inset-x-0"
                        style={{
                          bottom: `${c.prevPct}%`,
                          borderTop: `1.5px dashed ${DASH_COLOR}`,
                          opacity: 0.6,
                        }}
                      />
                      {before?.prevPct == null ? null : (
                        <Riser
                          from={before.prevPct}
                          to={c.prevPct}
                          color={DASH_COLOR}
                          width={1.5}
                          dashed
                          opacity={0.6}
                        />
                      )}
                    </>
                  )}
                  <div
                    className="absolute inset-x-0 h-0.5"
                    style={{ bottom: `calc(${c.pct}% - 1px)`, background: LINE_COLOR }}
                  />
                  {before ? <Riser from={before.pct} to={c.pct} /> : null}
                  <span
                    className="text-foreground-strong absolute left-1/2 -translate-x-1/2 text-[11px] font-bold"
                    style={{ bottom: `calc(${c.pct}% + 6px)` }}
                  >
                    {c.pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex">
        <div className={GUTTER} />
        <div className="flex min-w-0 flex-1">
          {columns.map((c) => (
            <div
              key={c.name}
              className="flex flex-1 flex-col items-center gap-1 pt-2 text-center"
              title={c.name}
            >
              <span className="h-2 w-2 rounded-[2px]" style={{ background: c.color }} />
              <span className="text-muted-strong text-[11px] leading-tight">
                {shortPhaseName(c.name)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-line-soft bg-surface-2 mt-4 rounded-sm border">
        <div className="flex items-center gap-2 px-3 pt-2.5 text-[11px]">
          <span className="bg-danger h-2.5 w-2.5 rounded-[2px]" />
          <span className="text-muted-strong font-bold uppercase tracking-wide">
            {t("wipesTitle")}
          </span>
          <span className="text-muted">{t("wipesHint")}</span>
        </div>
        <div className="flex pb-2">
          <div className={GUTTER} />
          <div className="flex h-[70px] min-w-0 flex-1 items-end">
            {columns.map((c) => (
              <div
                key={c.name}
                className="flex flex-1 flex-col items-center justify-end"
                title={tooltip(c)}
              >
                {c.wipes > 0 ? (
                  <>
                    <span
                      className={`mb-0.5 text-[11px] font-bold ${
                        c.wipes === maxWipes ? "text-danger" : "text-muted-strong"
                      }`}
                    >
                      {c.wipes}
                    </span>
                    <div
                      className="w-[min(50%,36px)] rounded-t-[2px]"
                      style={{
                        height: `${Math.max(4, (c.wipes / maxWipes) * 44)}px`,
                        background: c.wipes === maxWipes ? "var(--danger)" : "#4a4160",
                      }}
                    />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {worst ? (
        <p className="border-line-soft text-muted-strong mt-3 border-t pt-3 text-xs">
          {t.rich("biggestDrop", {
            phase: worst.name,
            wipes: worst.wipes,
            pct: percent(worst.wipes, attempts),
            name: (chunks) => <span className="text-danger font-semibold">{chunks}</span>,
          })}
        </p>
      ) : null}
    </div>
  );
}
