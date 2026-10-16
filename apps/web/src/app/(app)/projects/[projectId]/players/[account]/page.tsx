import { prisma } from "@voidlog/db";
import { Card } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  PlayerDpsChart,
  PlayerRevealChart,
  PlayerShockwaveChart,
  type PlayerChartPoint,
} from "@/components/player-charts";
import { PLAYER_STAT_MECHANICS, playerAttemptStats } from "@/lib/player-attempts";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils";

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

/** Statistics of one player over every batch of the project, one point per batch. */
export default async function ProjectPlayerPage(
  props: Readonly<PageProps<"/projects/[projectId]/players/[account]">>,
) {
  const { projectId, account: rawAccount } = await props.params;
  const account = decodeURIComponent(rawAccount);
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("playerDetail");
  const tRoster = await getTranslations("roster");
  const tCommon = await getTranslations("common");
  const tSidebar = await getTranslations("sidebar");

  // Only the events the three charts read: the player's own plus the boss's
  // casts (no player), which the shockwave count needs.
  const encounters = await prisma.encounterResult.findMany({
    where: { logFile: { batch: { projectId } } },
    select: {
      bossId: true,
      success: true,
      recordedAt: true,
      createdAt: true,
      logFile: { select: { batchId: true } },
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
  const own = encounters.flatMap((e) => e.playerResults.filter((p) => p.account === account));
  if (own.length === 0) notFound();

  // One point per batch: the batch's attempts in order, then summed up — DPS
  // averaged over the attempts the player took part in.
  const byBatch = Map.groupBy(encounters, (e) => e.logFile.batchId);
  const nights = [...byBatch.values()]
    .map((group) =>
      group.sort(
        (a, b) => (a.recordedAt ?? a.createdAt).getTime() - (b.recordedAt ?? b.createdAt).getTime(),
      ),
    )
    .sort(
      (a, b) =>
        (a[0]!.recordedAt ?? a[0]!.createdAt).getTime() -
        (b[0]!.recordedAt ?? b[0]!.createdAt).getTime(),
    )
    .map((group) => ({
      date: group[0]!.recordedAt ?? group[0]!.createdAt,
      batchId: group[0]!.logFile.batchId,
      played: playerAttemptStats(account, group).filter((s) => s.dps !== null),
    }));

  const points: PlayerChartPoint[] = nights.map((night) => {
    const sum = (pick: (s: (typeof night.played)[number]) => number | null) =>
      night.played.reduce((acc, s) => acc + (pick(s) ?? 0), 0);
    const took = night.played.length;
    return {
      label: formatDate(night.date, locale, { day: "2-digit", month: "2-digit" }),
      dps: took > 0 ? Math.round(sum((s) => s.dps) / took) : null,
      revealCount: took > 0 ? sum((s) => s.revealCount) : null,
      shockwavesPlayed: took > 0 ? sum((s) => s.shockwavesPlayed) : null,
      shockwavesHit: took > 0 ? sum((s) => s.shockwavesHit) : null,
    };
  });

  const allPlayed = nights.flatMap((n) => n.played);
  const avgDps = Math.round(allPlayed.reduce((sum, s) => sum + (s.dps ?? 0), 0) / own.length);
  const reveals = allPlayed.reduce((sum, s) => sum + (s.revealCount ?? 0), 0);
  const swPlayed = allPlayed.reduce((sum, s) => sum + (s.shockwavesPlayed ?? 0), 0);
  const swHit = allPlayed.reduce((sum, s) => sum + (s.shockwavesHit ?? 0), 0);

  const characterNames = [...new Set(own.map((p) => p.characterName))].join(", ");
  const roleCounts = new Map<string, number>();
  for (const p of own) if (p.role) roleCounts.set(p.role, (roleCounts.get(p.role) ?? 0) + 1);
  const role = [...roleCounts].sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: tRoster("breadcrumb"), href: `/projects/${projectId}/players` },
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
          {allPlayed.length}{" "}
          <span className="text-muted text-sm font-medium">/ {encounters.length}</span>
          <div className="text-muted text-xs font-medium">
            {t("stats.batches", { count: nights.length })}
          </div>
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

      <Link
        href={`/projects/${projectId}/players`}
        className="text-accent mb-3 inline-block text-sm hover:underline"
      >
        {t("backToRoster")}
      </Link>
      <p className="text-muted mb-3.5 text-xs">{t("axisHintProject")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("chartsProject.dps")}>
          <PlayerDpsChart points={points} />
        </ChartCard>
        <ChartCard title={t("chartsProject.reveals")}>
          <PlayerRevealChart points={points} />
        </ChartCard>
        <ChartCard title={t("chartsProject.shockwavesHit")}>
          <PlayerShockwaveChart points={points} />
        </ChartCard>
      </div>
    </div>
  );
}
