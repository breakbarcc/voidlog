import { phaseColor } from "@/components/phase-badge";
import { greenRole, type CircleStat } from "@/lib/green-details";
import { greensConfig } from "@/lib/green-stats";
import { GreensByRoleView, type GreenPhase, type GreenRow } from "./greens-by-role-view";

/**
 * Which Green circle (and so which role) the squad fails, over the whole
 * project: a circle counts as failed in a wave only when it was the one short
 * on players, not when it was merely flagged along with it (see the worker's
 * green-waves.ts). A wave in which two circles fail counts for both roles.
 */
export function GreensByRole({
  bossId,
  circles,
}: Readonly<{ bossId: string; circles: CircleStat[] }>) {
  if (circles.length === 0) return null;

  const rows: GreenRow[] = circles.map((c) => ({
    phase: c.phase,
    label: c.label,
    role: greenRole(bossId, c.phase, c.label),
    played: c.played,
    failed: c.failed,
  }));

  // Fight order: the boss's curated phase order, anything unknown behind it.
  const curated = Object.keys(greensConfig(bossId)?.roles ?? {});
  const present = new Set(rows.map((r) => r.phase));
  const order = [
    ...curated.filter((p) => present.has(p)),
    ...[...present].filter((p) => !curated.includes(p)),
  ];

  const phases: GreenPhase[] = order.map((name, index) => ({
    name,
    color: phaseColor(bossId, index, name),
    waves: Math.max(...rows.filter((r) => r.phase === name).map((r) => r.played)),
  }));

  return <GreensByRoleView rows={rows} phases={phases} />;
}
