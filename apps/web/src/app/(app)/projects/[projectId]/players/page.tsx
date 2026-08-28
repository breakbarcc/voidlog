import { prisma } from "@voidlog/db";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { RosterTable } from "./roster-table";

interface RosterEntry {
  account: string;
  characterNames: Set<string>;
  encounters: number;
  totalDps: number;
  kills: number;
  totalDowns: number;
  roleCounts: Map<string, number>;
  lastActive: Date;
  shockwaveHits: number;
  debilitatedHits: number;
  revealCount: number;
}

export default async function RosterPage(
  props: Readonly<PageProps<"/projects/[projectId]/players">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const t = await getTranslations("roster");
  const tSidebar = await getTranslations("sidebar");

  const playerResults = await prisma.playerResult.findMany({
    where: { encounterResult: { logFile: { batch: { projectId } } } },
    select: {
      account: true,
      characterName: true,
      dps: true,
      downs: true,
      role: true,
      encounterResult: { select: { success: true, createdAt: true } },
      mechanicEvents: { select: { mechanicName: true } },
    },
  });

  // Grouped by account, not character name — character names change,
  // the account handle doesn't (ADR-009).
  const byAccount = new Map<string, RosterEntry>();
  for (const p of playerResults) {
    const entry = byAccount.get(p.account) ?? {
      account: p.account,
      characterNames: new Set<string>(),
      encounters: 0,
      totalDps: 0,
      kills: 0,
      totalDowns: 0,
      roleCounts: new Map<string, number>(),
      lastActive: p.encounterResult.createdAt,
      shockwaveHits: 0,
      debilitatedHits: 0,
      revealCount: 0,
    };
    entry.characterNames.add(p.characterName);
    entry.encounters += 1;
    entry.totalDps += p.dps;
    entry.totalDowns += p.downs;
    if (p.encounterResult.success) entry.kills += 1;
    if (p.encounterResult.createdAt > entry.lastActive)
      entry.lastActive = p.encounterResult.createdAt;
    if (p.role) entry.roleCounts.set(p.role, (entry.roleCounts.get(p.role) ?? 0) + 1);
    // "ShckWv.H" is Mordremoth's raw EI code for a Schockwelle hit — same
    // hardcoded-stat treatment as the batch-roster and batch-detail stats.
    entry.shockwaveHits += p.mechanicEvents.filter((m) => m.mechanicName === "ShckWv.H").length;
    // "Debilitated" is HTCM's raw EI debuff name for the Geschwächt stack
    // (see harvest-temple.ts) — same hardcoded-stat treatment.
    entry.debilitatedHits += p.mechanicEvents.filter(
      (m) => m.mechanicName === "Debilitated",
    ).length;
    // "Revealed" is only persisted for isolated early reveals during the
    // Mass-Invisibility stealth window (group "attack now" calls are
    // filtered out entirely — see stealth-phases.ts on the worker), so
    // every occurrence here is already a genuine early-reveal mistake.
    entry.revealCount += p.mechanicEvents.filter((m) => m.mechanicName === "Revealed").length;
    byAccount.set(p.account, entry);
  }

  const roster = [...byAccount.values()].map((entry) => {
    const role = [...entry.roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return {
      account: entry.account,
      characterNames: [...entry.characterNames].join(", "),
      role,
      encounters: entry.encounters,
      kills: entry.kills,
      avgDps: Math.round(entry.totalDps / entry.encounters),
      avgDowns: (entry.totalDowns / entry.encounters).toFixed(1),
      lastActive: entry.lastActive,
      shockwaveHits: entry.shockwaveHits,
      // Hits per encounter (not a percentage) — a player can be hit by
      // more than one shockwave per encounter, so a "%" reads oddly once
      // it passes 100.
      shockwaveHitsPerEncounter: (entry.shockwaveHits / entry.encounters).toFixed(2),
      debilitatedHits: entry.debilitatedHits,
      debilitatedHitsPerEncounter: (entry.debilitatedHits / entry.encounters).toFixed(2),
      revealCount: entry.revealCount,
      revealCountPerEncounter: (entry.revealCount / entry.encounters).toFixed(2),
    };
  });

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: t("breadcrumb") },
        ]}
      />
      <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted mb-6 mt-1 text-sm">{t("subtitle")}</p>

      <RosterTable roster={roster} />
    </div>
  );
}
