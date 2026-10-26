import { prisma } from "@voidlog/db";
import { Card, Table } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ChompsChartCard, type ChompChartPoint } from "@/components/chomps-chart";
import {
  PlayerDebilitatedChart,
  PlayerDpsChart,
  PlayerRevealChart,
  PlayerShockwaveChart,
  type PlayerChartPoint,
} from "@/components/player-charts";
import { translateMechanicName } from "@/lib/mechanic-names";
import {
  DOWNED_MECHANIC_NAME,
  GENERIC_CAST_MARKER_NAME_PART,
  isContextualNoiseMechanic,
  isNoiseMechanic,
  isVisibleCastMarker,
  unusedMechanicNames,
} from "@/lib/mechanics";
import {
  PLAYER_STAT_MECHANICS,
  STEALTH_CAST_MECHANIC,
  playerAttemptStats,
} from "@/lib/player-attempts";
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

const TOP_FAILED_MECHANICS = 5;

// Conditions another mechanic puts on the player (Void.D from the void
// pools, Debilitated/Infirmity from hits), so the hit itself is the fail.
const STATUS_EFFECT_MECHANICS = new Set(["Void.D", "Debilitated", "Infirmity"]);

interface FailedMechanic {
  bossId: string;
  mechanicName: string;
  displayName: string;
  count: number;
  attempts: number;
}

/**
 * The player's most frequent fails over all their attempts. Same fail
 * definition as the batch page's phase and roster stats (everything except
 * deaths, curated cast markers and (contextual) noise mechanics), minus
 * downstates and status effects: both are the outcome of a hit, not a
 * mechanic of their own, and would otherwise top most players' lists.
 */
function topFailedMechanics(
  encounters: readonly {
    bossId: string;
    mechanicEvents: { mechanicName: string; displayName: string; timeMs: number }[];
  }[],
  locale: Locale,
): FailedMechanic[] {
  const byName = new Map<string, FailedMechanic>();
  for (const encounter of encounters) {
    const seen = new Set<string>();
    for (const event of encounter.mechanicEvents) {
      if (
        event.mechanicName === "Dead" ||
        event.mechanicName === DOWNED_MECHANIC_NAME ||
        STATUS_EFFECT_MECHANICS.has(event.mechanicName) ||
        isVisibleCastMarker(encounter.bossId, event.mechanicName) ||
        isNoiseMechanic(encounter.bossId, event.mechanicName) ||
        isContextualNoiseMechanic(encounter.bossId, event, encounter.mechanicEvents)
      )
        continue;
      // Raw names aren't unique across bosses, so they're kept apart per boss.
      const key = `${encounter.bossId}:${event.mechanicName}`;
      const entry = byName.get(key) ?? {
        bossId: encounter.bossId,
        mechanicName: event.mechanicName,
        displayName: translateMechanicName(
          encounter.bossId,
          locale,
          event.mechanicName,
          event.displayName,
        ),
        count: 0,
        attempts: 0,
      };
      entry.count += 1;
      if (!seen.has(key)) entry.attempts += 1;
      seen.add(key);
      byName.set(key, entry);
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.count - a.count || b.attempts - a.attempts)
    .slice(0, TOP_FAILED_MECHANICS);
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
  const tChomps = await getTranslations("chomps");
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
              OR: [
                { playerResult: { is: null } },
                { playerResult: { is: { account } } },
                { mechanicName: STEALTH_CAST_MECHANIC },
              ],
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

  // The player's own events for the fail table, minus what no view reads
  // (noise such as "Orb Push" and the bulk-captured casts are most rows).
  const bossIds = [...new Set(encounters.map((e) => e.bossId))];
  const ownResults = await prisma.playerResult.findMany({
    where: { account, encounterResult: { logFile: { batch: { projectId } } } },
    select: {
      encounterResult: { select: { bossId: true } },
      mechanicEvents: {
        where: {
          mechanicName: { notIn: unusedMechanicNames(bossIds) },
          NOT: { mechanicName: { contains: GENERIC_CAST_MARKER_NAME_PART } },
        },
        select: { mechanicName: true, displayName: true, timeMs: true },
      },
    },
  });
  const failedMechanics = topFailedMechanics(
    ownResults.map((r) => ({ bossId: r.encounterResult.bossId, mechanicEvents: r.mechanicEvents })),
    locale,
  );

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
      // Average per attempt, so batches with more attempts stay comparable.
      revealCount: took > 0 ? Math.round((sum((s) => s.revealCount) / took) * 100) / 100 : null,
      debilitatedCount:
        took > 0 ? Math.round((sum((s) => s.debilitatedCount) / took) * 100) / 100 : null,
      shockwaveRate:
        sum((s) => s.shockwavesPlayed) > 0
          ? Math.round((sum((s) => s.shockwavesHit) / sum((s) => s.shockwavesPlayed)) * 100)
          : null,
      shockwavesPlayed: took > 0 ? sum((s) => s.shockwavesPlayed) : null,
      shockwavesHit: took > 0 ? sum((s) => s.shockwavesHit) : null,
    };
  });

  // Chomps: averaged over the attempts that reached Primordus's attacks.
  const chompPoints: ChompChartPoint[] = nights.map((night, i) => {
    const withAttacks = night.played.flatMap((s) => (s.chomps ? [s.chomps] : []));
    const avg = (pick: (c: { slam: number; jaws: number }) => number) =>
      Math.round((withAttacks.reduce((sum, c) => sum + pick(c), 0) / withAttacks.length) * 100) / 100;
    return {
      label: points[i]!.label,
      slam: withAttacks.length > 0 ? avg((c) => c.slam) : null,
      jaws: withAttacks.length > 0 ? avg((c) => c.jaws) : null,
      reached: withAttacks.length,
      attemptsSlam: withAttacks.filter((c) => c.slam > 0).length,
      attemptsAny: withAttacks.filter((c) => c.slam + c.jaws > 0).length,
    };
  });

  const allPlayed = nights.flatMap((n) => n.played);
  const avgDps = Math.round(allPlayed.reduce((sum, s) => sum + (s.dps ?? 0), 0) / own.length);
  const reveals = allPlayed.reduce((sum, s) => sum + (s.revealCount ?? 0), 0);
  const stealthWindows = allPlayed.reduce((sum, s) => sum + (s.stealthWindows ?? 0), 0);
  const swPlayed = allPlayed.reduce((sum, s) => sum + (s.shockwavesPlayed ?? 0), 0);
  const swHit = allPlayed.reduce((sum, s) => sum + (s.shockwavesHit ?? 0), 0);
  const chompSlam = allPlayed.reduce((sum, s) => sum + (s.chomps?.slam ?? 0), 0);
  const chompJaws = allPlayed.reduce((sum, s) => sum + (s.chomps?.jaws ?? 0), 0);

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

      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <StatCard label={t("stats.attempts")}>
          {allPlayed.length}{" "}
          <span className="text-muted text-sm font-medium">/ {encounters.length}</span>
          <div className="text-muted text-xs font-medium">
            {t("stats.batches", { count: nights.length })}
          </div>
        </StatCard>
        <StatCard label={t("stats.avgDps")}>{formatNumber(avgDps, locale)}</StatCard>
        <StatCard label={t("stats.reveals")} hint={t("stats.revealsHint")}>
          <span className="text-warning">
            {stealthWindows > 0
              ? `${Math.round((reveals / stealthWindows) * 100)}%`
              : tCommon("dash")}{" "}
            <span className="text-muted text-sm font-medium">
              ({reveals}/{stealthWindows})
            </span>
          </span>
        </StatCard>
        <StatCard label={t("stats.shockwaves")} hint={t("stats.shockwavesHint")}>
          <span className="text-danger">
            {swPlayed > 0 ? `${Math.round((swHit / swPlayed) * 100)}%` : tCommon("dash")}{" "}
            <span className="text-muted text-sm font-medium">
              ({swHit}/{swPlayed})
            </span>
          </span>
        </StatCard>
        <StatCard label={tChomps("statsLabel")} hint={tChomps("statsHint")}>
          <span className="text-danger">{chompSlam + chompJaws}</span>
          <div className="text-muted text-xs font-medium">
            {tChomps("statsSplit", { slam: chompSlam, jaws: chompJaws })}
          </div>
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
        <ChompsChartCard title={t("chartsProject.chomps")} points={chompPoints} unit="average" />
        <ChartCard title={t("chartsProject.debilitated")}>
          <PlayerDebilitatedChart points={points} />
        </ChartCard>
      </div>

      <h2 className="text-muted-strong mb-1 mt-8 text-xs font-medium uppercase tracking-wide">
        {t("failedMechanics.title", { count: TOP_FAILED_MECHANICS })}
      </h2>
      <p className="text-muted mb-3.5 text-xs">{t("failedMechanics.hint")}</p>
      <Table.Root variant="surface" className="border-line bg-surface border">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>#</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("failedMechanics.mechanic")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("failedMechanics.count")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("failedMechanics.perAttempt")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell title={t("failedMechanics.attemptsHint")}>
              {t("failedMechanics.attempts")}
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {failedMechanics.map((m, i) => (
            <Table.Row key={`${m.bossId}:${m.mechanicName}`}>
              <Table.Cell className="text-muted">{i + 1}</Table.Cell>
              <Table.Cell>
                <div className="text-foreground font-semibold">{m.displayName}</div>
                <div className="text-muted text-xs">{m.mechanicName}</div>
              </Table.Cell>
              <Table.Cell className="text-warning font-semibold">{m.count}</Table.Cell>
              <Table.Cell className="text-muted-strong">
                {(m.count / own.length).toFixed(2)}
              </Table.Cell>
              <Table.Cell className="text-warning font-semibold">
                {Math.round((m.attempts / own.length) * 100)}%{" "}
                <span className="text-muted text-sm font-medium">
                  ({m.attempts}/{own.length})
                </span>
              </Table.Cell>
            </Table.Row>
          ))}
          {failedMechanics.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={5} className="text-muted">
                {t("failedMechanics.empty")}
              </Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
    </div>
  );
}
