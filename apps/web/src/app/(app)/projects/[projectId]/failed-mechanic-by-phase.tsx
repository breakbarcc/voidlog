import { Card } from "@radix-ui/themes";
import { getLocale, getTranslations } from "next-intl/server";
import { readableHeadingColor } from "@/components/phase-badge";
import {
  TOP_FAILED_MECHANICS_PER_PHASE,
  type FailedMechanic,
  type PhaseFailedMechanic,
} from "@/lib/failed-mechanics-view";

// Rank 1 in the phase's color, the runners-up fading out.
const RANK_OPACITY = [1, 0.6, 0.4];

/**
 * The most failed mechanics of each phase, in fight order
 * (lib/failed-mechanics.ts), as horizontal bars: one group per phase, each
 * bar's length the fails per attempt that reached the phase, so late phases
 * (reached rarely) compare fairly with early ones. All bars share one scale.
 */
export async function FailedMechanicByPhase({
  phases,
}: Readonly<{ phases: PhaseFailedMechanic[] }>) {
  const t = await getTranslations("failedMechanics.byPhase");
  const locale = await getLocale();
  const rate = (mechanic: FailedMechanic, phase: PhaseFailedMechanic) =>
    mechanic.count / phase.reached;
  const max = Math.max(0, ...phases.flatMap((p) => p.top.map((m) => rate(m, p))));

  return (
    <Card size="3" className="border-line bg-surface mt-3.5 border">
      <div className="text-muted-strong mb-1 text-xs font-medium uppercase tracking-wide">
        {t("title", { count: TOP_FAILED_MECHANICS_PER_PHASE })}
      </div>
      <p className="text-muted mb-2 text-xs">{t("hint")}</p>
      <div className="divide-line-soft flex flex-col divide-y">
        {phases.map((phase) => {
          const color = readableHeadingColor(phase.color);
          return (
            <div
              key={`${phase.bossId}|${phase.phase}`}
              className="grid grid-cols-1 gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[9rem_1fr]"
            >
              <div className="text-sm font-semibold" style={{ color }}>
                {phase.phase}
              </div>
              {phase.top.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {phase.top.map((mechanic, rank) => {
                    const value = rate(mechanic, phase);
                    return (
                      <div key={mechanic.mechanicName}>
                        <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
                          <span
                            className={`text-sm ${rank === 0 ? "text-foreground font-medium" : "text-muted-strong"}`}
                          >
                            {mechanic.displayName}
                          </span>
                          <span className="text-muted text-xs">
                            {t("details", {
                              count: mechanic.count,
                              attempts: mechanic.attempts,
                              reached: phase.reached,
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-sm">
                            <div
                              className="h-full rounded-sm"
                              style={{
                                width: `${max > 0 ? (value / max) * 100 : 0}%`,
                                background: color,
                                opacity: RANK_OPACITY[rank] ?? 0.4,
                              }}
                            />
                          </div>
                          <span className="text-muted-strong w-28 shrink-0 text-right text-xs tabular-nums">
                            {t("perAttempt", {
                              value: value.toLocaleString(locale, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }),
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted text-sm">{t("none")}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
