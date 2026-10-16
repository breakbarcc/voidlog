import { prisma } from "@voidlog/db";
import { Card } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { loadBatchTitles } from "@/lib/batch-title";
import { PLAYER_STAT_MECHANICS, playerAttemptStats } from "@/lib/player-attempts";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { formatNumber } from "@/lib/utils";
import { PlayerDpsChart, PlayerRevealChart, PlayerShockwaveChart } from "@/components/player-charts";

function StatCard({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <Card size="2" className="border-line bg-surface border">
      <div
        className="text-muted mb-1.5 text-[11px] font-medium uppercase tracking-wide"
        title={hint}
      >
        {label}
      </div>
      <div className="font-heading text-foreground text-xl font-bold">{children}</div>
    </Card>
  );
}

function ChartCard({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Card size="3" className="border-line bg-surface border">
      <div className="text-muted-strong mb-3.5 text-xs font-medium uppercase tracking-wide">
        {title}
      </div>
      {children}
    </Card>
  );
}

/** Statistics of one player over the attempts of one batch. */
export default async function BatchPlayerPage(
  props: Readonly<PageProps<"/projects/[projectId]/batches/[batchId]/players/[account]">>,
) {
  const { projectId, batchId, account: rawAccount } = await props.params;
  const account = decodeURIComponent(rawAccount);
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("playerDetail");
  const tCommon = await getTranslations("common");
  const tSidebar = await getTranslations("sidebar");

  const batch = await prisma.uploadBatch.findUnique({
    where: { id: batchId },
    select: { id: true, projectId: true, label: true, createdAt: true },
  });
  if (batch?.projectId !== projectId) notFound();

  // Only the events the three charts read: the player's own plus the boss's
  // casts (no player), which the shockwave count needs.
  const encounterRows = await prisma.encounterResult.findMany({
    where: { logFile: { batchId } },
    select: {
      bossId: true,
      success: true,
      recordedAt: true,
      createdAt: true,
      playerResults: { select: { account: true, characterName: true, dps: true, role: true } },
      phaseResults: {
        select: {
          mechanicEvents: {
            where: {
              mechanicName: { in: [...PLAYER_STAT_MECHANICS] },
              OR: [{ playerResult: { is: null } }, { playerResult: { is: { account } } }],
            },
            select: {
              mechanicName: true,
              timeMs: true,
              playerResult: { select: { account: true } },
            },
          },
        },
      },
    },
  });
  const encounters = encounterRows.sort(
    (a, b) => (a.recordedAt ?? a.createdAt).getTime() - (b.recordedAt ?? b.createdAt).getTime(),
  );

  const own = encounters.flatMap((e) => e.playerResults.filter((p) => p.account === account));
  if (own.length === 0) notFound();

  const characterNames = [...new Set(own.map((p) => p.characterName))].join(", ");
  const roleCounts = new Map<string, number>();
  for (const p of own) if (p.role) roleCounts.set(p.role, (roleCounts.get(p.role) ?? 0) + 1);
  const role = [...roleCounts].sort((a, b) => b[1] - a[1])[0]?.[0];

  const stats = playerAttemptStats(account, encounters);
  const played = stats.filter((s) => s.dps !== null);
  const avgDps = Math.round(played.reduce((sum, s) => sum + (s.dps ?? 0), 0) / played.length);
  const reveals = played.reduce((sum, s) => sum + (s.revealCount ?? 0), 0);
  const swPlayed = played.reduce((sum, s) => sum + (s.shockwavesPlayed ?? 0), 0);
  const swHit = played.reduce((sum, s) => sum + (s.shockwavesHit ?? 0), 0);

  const title = (await loadBatchTitles([batch], locale)).get(batch.id) ?? batch.label;
  const points = stats.map((s) => ({
    label: `#${s.n}`,
    dps: s.dps,
    revealCount: s.revealCount,
    shockwavesPlayed: s.shockwavesPlayed,
    shockwavesHit: s.shockwavesHit,
  }));

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: title, href: `/projects/${projectId}/batches/${batchId}` },
          { label: account },
        ]}
      />
      <div className="mb-6">
        <h1 className="font-heading text-foreground-strong text-xl font-bold">{account}</h1>
        <div className="text-muted text-sm">
          {characterNames}
          {role ? ` · ${role}` : ""}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label={t("stats.attempts")}>
          {played.length}{" "}
          <span className="text-muted text-sm font-medium">/ {stats.length}</span>
        </StatCard>
        <StatCard label={t("stats.avgDps")}>{formatNumber(avgDps, locale)}</StatCard>
        <StatCard label={t("stats.reveals")} hint={t("stats.revealsHint")}>
          <span className="text-warning">{reveals}</span>
        </StatCard>
        <StatCard label={t("stats.shockwaves")} hint={t("stats.shockwavesHint")}>
          <span className="text-danger">
            {swPlayed > 0 ? `${Math.round((swHit / swPlayed) * 100)}%` : tCommon("dash")}{" "}
            <span className="text-muted text-sm font-medium">
              ({swHit}/{swPlayed})
            </span>
          </span>
        </StatCard>
      </div>

      <p className="text-muted mb-3.5 text-xs">{t("axisHint")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("charts.dps")}>
          <PlayerDpsChart points={points} />
        </ChartCard>
        <ChartCard title={t("charts.reveals")}>
          <PlayerRevealChart points={points} />
        </ChartCard>
        <ChartCard title={t("charts.shockwavesHit")}>
          <PlayerShockwaveChart points={points} />
        </ChartCard>
      </div>
    </div>
  );
}
