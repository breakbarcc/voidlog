import { Card } from "@radix-ui/themes";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { greenRole, type CircleStat } from "@/lib/green-details";
import { formatPercent } from "@/lib/utils";

/**
 * Which Green circle (and so which role) the squad fails, over the whole
 * project: a circle counts as failed in a wave only when it was the one short
 * on players, not when it was merely flagged along with it (see the worker's
 * green-waves.ts). A wave in which two circles fail counts for both roles.
 */
export async function GreensByRole({
  bossId,
  circles,
  locale,
}: Readonly<{ bossId: string; circles: CircleStat[]; locale: Locale }>) {
  const t = await getTranslations("statistics.greensByRole");
  const tCommon = await getTranslations("common");

  const rows = circles
    .map((c) => ({ ...c, role: greenRole(bossId, c.phase, c.label) }))
    .sort((a, b) => b.failed / b.played - a.failed / a.played || b.played - a.played);
  if (rows.length === 0) return null;

  // The same role in different phases, rolled up.
  const roles = new Map<string, { played: number; failed: number }>();
  for (const row of rows) {
    if (!row.role) continue;
    const entry = roles.get(row.role) ?? { played: 0, failed: 0 };
    entry.played += row.played;
    entry.failed += row.failed;
    roles.set(row.role, entry);
  }
  const rate = (r: { played: number; failed: number }) =>
    r.played > 0 ? formatPercent((r.failed / r.played) * 100, locale) : tCommon("dash");

  return (
    <Card size="3" className="border-line bg-surface mb-6 border">
      <div className="text-muted-strong mb-1 text-xs font-medium uppercase tracking-wide">
        {t("title")}
      </div>
      <p className="text-muted mb-4 text-sm">{t("hint")}</p>

      {roles.size > 0 ? (
        <div className="mb-5 flex flex-wrap gap-3">
          {[...roles]
            .sort((a, b) => b[1].failed / b[1].played - a[1].failed / a[1].played)
            .map(([role, r]) => (
              <div key={role} className="border-line bg-surface-2 rounded-sm border px-4 py-2.5">
                <div className="text-muted text-[11px] font-medium uppercase tracking-wide">
                  {role}
                </div>
                <div className="font-heading text-foreground-strong text-xl font-bold">
                  {rate(r)}{" "}
                  <span className="text-muted text-sm font-normal">
                    ({r.failed}/{r.played})
                  </span>
                </div>
              </div>
            ))}
        </div>
      ) : null}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted text-left text-xs uppercase tracking-wide">
            <th className="py-1.5 font-medium">{t("phase")}</th>
            <th className="py-1.5 font-medium">{t("circle")}</th>
            <th className="py-1.5 font-medium">{t("role")}</th>
            <th className="py-1.5 text-right font-medium">{t("failed")}</th>
            <th className="py-1.5 text-right font-medium">{t("rate")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.phase}|${row.label}`}
              className="border-line-soft border-t hover:bg-white/5"
            >
              <td className="text-foreground py-1.5">{row.phase}</td>
              <td className="text-muted-strong py-1.5">{row.label}</td>
              <td className="text-foreground py-1.5">{row.role ?? tCommon("dash")}</td>
              <td className="text-muted-strong py-1.5 text-right tabular-nums">
                {row.failed}/{row.played}
              </td>
              <td
                className={`py-1.5 text-right font-semibold tabular-nums ${
                  row.failed > 0 ? "text-danger" : "text-muted"
                }`}
              >
                {rate(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
