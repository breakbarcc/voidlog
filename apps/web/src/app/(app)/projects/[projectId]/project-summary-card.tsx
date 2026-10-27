import { Card } from "@radix-ui/themes";
import { getLocale, getTranslations } from "next-intl/server";
import { phaseColor } from "@/components/phase-badge";
import type { ProjectSummary } from "@/lib/project-summary";

/**
 * "13%"; below 1% with one decimal ("0,4%" in German), so a rare but
 * non-zero count (two Soo-Won kills in 470 attempts) doesn't read as 0%.
 */
function formatPercent(locale: string, part: number, total: number): string {
  if (total === 0) return "—";
  const value = (part / total) * 100;
  const digits = value > 0 && value < 1 ? 1 : 0;
  return `${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function Tile({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <div className="border-line rounded-md border px-4 py-3">
      <div
        className="text-muted mb-1.5 text-[11px] font-medium uppercase tracking-wide"
        title={hint}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/** Totals over every attempt of the project (lib/project-summary.ts). */
export async function ProjectSummaryCard({ summary }: Readonly<{ summary: ProjectSummary }>) {
  const t = await getTranslations("statistics.summary");
  const locale = await getLocale();
  const percent = (part: number, total: number) => formatPercent(locale, part, total);
  const totalMinutes = Math.round(summary.durationMs / 60_000);
  const { greens, chomps, reveals } = summary;

  return (
    <Card size="3" className="border-line bg-surface mb-3.5 border">
      <div className="text-muted-strong mb-3.5 text-xs font-medium uppercase tracking-wide">
        {t("title")}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label={t("attempts")}>
          <div className="font-heading text-foreground text-xl font-bold">{summary.attempts}</div>
        </Tile>
        <Tile label={t("duration")} hint={t("durationHint")}>
          <div className="font-heading text-foreground text-xl font-bold">
            {t("hoursMinutes", {
              hours: Math.floor(totalMinutes / 60),
              minutes: totalMinutes % 60,
            })}
          </div>
        </Tile>
        <Tile label={t("greens")} hint={t("greensHint")}>
          <div className="font-heading text-danger text-xl font-bold">
            {greens.failed}{" "}
            <span className="text-muted text-sm font-medium">
              / {greens.played} ({percent(greens.failed, greens.played)})
            </span>
          </div>
          <div className="text-muted text-xs">{t("inAttempts", { count: greens.attempts })}</div>
        </Tile>
        <Tile label={t("chomps")} hint={t("chompsHint")}>
          <div className="font-heading text-danger text-xl font-bold">
            {chomps.slam + chomps.jaws}
          </div>
          <div className="text-muted text-xs">
            {t("chompsSplit", { slam: chomps.slam, jaws: chomps.jaws })}
          </div>
          <div className="text-muted text-xs">
            {t("chompAttempts", { chomped: chomps.attemptsChomped, total: chomps.attempts })}
          </div>
        </Tile>
        <Tile label={t("reveals")} hint={t("revealsHint")}>
          <div className="font-heading text-warning text-xl font-bold">{reveals.reveals}</div>
          <div className="text-muted text-xs">
            {t("revealWindows", {
              revealed: reveals.revealed,
              windows: reveals.windows,
              percent: percent(reveals.revealed, reveals.windows),
            })}
          </div>
        </Tile>
      </div>

      {summary.kills ? (
        <>
          <div
            className="text-muted mb-2 mt-4 text-[11px] font-medium uppercase tracking-wide"
            title={t("killsHint")}
          >
            {t("kills")}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {summary.kills.map((kill, i) => (
              <div
                key={`${kill.bossId}|${kill.name}`}
                className="border-line rounded-md border border-l-4 px-3 py-2"
                style={{ borderLeftColor: phaseColor(kill.bossId, i, kill.phase) }}
              >
                <div className="text-muted-strong text-xs">{kill.name}</div>
                <div className="font-heading text-foreground text-lg font-bold">
                  {kill.count}{" "}
                  <span className="text-muted text-sm font-medium">
                    ({percent(kill.count, summary.attempts)})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}
