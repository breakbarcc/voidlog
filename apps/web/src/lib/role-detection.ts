import { getBossCuration } from "./bosses/registry";
import { greenRole, readGreenWave } from "./green-details";

/**
 * Suggests a squad role per account from what the logs show, so the roster
 * doesn't have to be filled by hand (`BossCuration.roleDetection`).
 *
 * No single indicator decides:
 * - Greens: the circle a player keeps standing in belongs to a role
 *   (`GreensConfig.roles`). Mostly one circle → that role's circle.
 * - Boons: the squad's Quickness/Alacrity givers (top of the group generation
 *   per attempt) are the boon roles. Needed on top where roles share a circle.
 * - Damage: only confirms — a contradiction lowers the certainty, but damage
 *   alone never picks or rejects a role.
 * Circle and boons have to agree; where they contradict, or the data is too
 * thin, there is no suggestion.
 */

/** Circle appearances needed before the Greens say anything. */
const MIN_CIRCLE_VOTES = 6;
/** Share of an account's circle appearances that must fall on one circle role. */
const CIRCLE_SHARE = 0.8;
/** Attempts with boon data needed before the boons say anything. */
const MIN_BOON_ATTEMPTS = 3;
/** Share of attempts as a boon giver at/above which the account counts as one (and at/below 1 − it, as none). */
const BOON_SHARE = 0.7;
/** Average damage below this share of the squad's median counts as "low damage". */
const LOW_DAMAGE_RATIO = 0.5;

export interface DetectionPlayer {
  account: string;
  characterName: string;
  dps: number;
  quicknessGeneration: number | null;
  alacrityGeneration: number | null;
}

export interface DetectionEncounter {
  bossId: string;
  players: readonly DetectionPlayer[];
  /** `context` of the encounter's Green.Spawn events. */
  waveContexts: readonly unknown[];
}

export interface RoleSuggestion {
  role: string;
  /** "high": circle and boons agree and damage doesn't object; "medium": otherwise. */
  certainty: "high" | "medium";
  /** Share of the account's circle appearances that matched, and how many there were. */
  circleShare: number;
  circleVotes: number;
  /** Share of attempts as a boon giver; null without boon data. */
  boonShare: number | null;
  boonAttempts: number;
  /** Whether the damage fits the role; null where it can't say. */
  damageFits: boolean | null;
}

interface Tally {
  circleVotes: Map<string, number>;
  giverAttempts: number;
  boonAttempts: number;
  dpsRatios: number[];
}

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Suggestions per account, only for roles of the bosses in `encounters`. */
export function detectRoles(
  encounters: readonly DetectionEncounter[],
): Map<string, RoleSuggestion> {
  const tallies = new Map<string, Tally>();
  const tallyOf = (account: string) => {
    let tally = tallies.get(account);
    if (!tally) {
      tally = { circleVotes: new Map(), giverAttempts: 0, boonAttempts: 0, dpsRatios: [] };
      tallies.set(account, tally);
    }
    return tally;
  };
  // Per account, the boss the suggestion is made for (the one most attempts are of).
  const attemptsByBoss = new Map<string, Map<string, number>>();

  for (const encounter of encounters) {
    const detection = getBossCuration(encounter.bossId)?.roleDetection;
    const composition = getBossCuration(encounter.bossId)?.squadComposition;
    if (!detection) continue;
    const { players } = encounter;

    for (const p of players) {
      const bosses = attemptsByBoss.get(p.account) ?? new Map<string, number>();
      bosses.set(encounter.bossId, (bosses.get(encounter.bossId) ?? 0) + 1);
      attemptsByBoss.set(p.account, bosses);
    }

    // Greens: whoever stood in a circle votes for that circle's role.
    const byCharacter = new Map(players.map((p) => [p.characterName, p.account]));
    for (const context of encounter.waveContexts) {
      const wave = readGreenWave(context);
      if (!wave) continue;
      for (const circle of wave.circles) {
        const role = greenRole(encounter.bossId, wave.phase, circle.label);
        if (role === null || !circle.insideKnown) continue;
        for (const name of circle.inside) {
          const account = byCharacter.get(name);
          if (account === undefined) continue;
          const votes = tallyOf(account).circleVotes;
          votes.set(role, (votes.get(role) ?? 0) + 1);
        }
      }
    }

    // Boons: the top givers of a full squad. A squad with fewer players, or
    // no captured boon data at all, says nothing.
    const squadFull = composition === undefined || players.length >= composition.size;
    const hasBoons = players.some(
      (p) => p.quicknessGeneration !== null || p.alacrityGeneration !== null,
    );
    if (squadFull && hasBoons) {
      const givers = detection.boonRoles.reduce(
        (sum, role) => sum + (composition?.counts[role] ?? 0),
        0,
      );
      const total = (p: DetectionPlayer) => (p.quicknessGeneration ?? 0) + (p.alacrityGeneration ?? 0);
      const top = new Set(
        players
          .toSorted((a, b) => total(b) - total(a))
          .slice(0, givers)
          .map((p) => p.account),
      );
      for (const p of players) {
        const tally = tallyOf(p.account);
        tally.boonAttempts += 1;
        if (top.has(p.account)) tally.giverAttempts += 1;
      }
    }

    // Damage relative to the attempt's median, for the confirmation only.
    const squadMedian = median(players.map((p) => p.dps));
    if (squadMedian > 0) {
      for (const p of players) tallyOf(p.account).dpsRatios.push(p.dps / squadMedian);
    }
  }

  const suggestions = new Map<string, RoleSuggestion>();
  for (const [account, tally] of tallies) {
    const bossId = [...(attemptsByBoss.get(account) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
    const detection = bossId ? getBossCuration(bossId)?.roleDetection : undefined;
    if (!detection) continue;

    const circleVotes = [...tally.circleVotes.values()].reduce((a, b) => a + b, 0);
    if (circleVotes < MIN_CIRCLE_VOTES) continue;
    // Roles sharing a circle count as one: it is where the player kept standing.
    const group = (role: string) => detection.sharedCircleRoles.find((g) => g.includes(role)) ?? [role];
    const groupVotes = new Map<string, number>();
    for (const [role, votes] of tally.circleVotes) {
      const key = group(role).join("|");
      groupVotes.set(key, (groupVotes.get(key) ?? 0) + votes);
    }
    const [topKey, topVotes] = [...groupVotes].sort((a, b) => b[1] - a[1])[0]!;
    const circleShare = topVotes / circleVotes;
    if (circleShare < CIRCLE_SHARE) continue;
    const candidates = topKey.split("|");

    const boonShare =
      tally.boonAttempts >= MIN_BOON_ATTEMPTS ? tally.giverAttempts / tally.boonAttempts : null;
    const isGiver = boonShare !== null && boonShare >= BOON_SHARE;
    const isNoGiver = boonShare !== null && boonShare <= 1 - BOON_SHARE;

    let role: string | undefined;
    if (candidates.length === 1) {
      role = candidates[0]!;
      // A boon pattern that contradicts the circle's role: no suggestion.
      if (detection.boonRoles.includes(role) ? isNoGiver : isGiver) continue;
    } else {
      // Boons have to decide between the roles of one circle.
      if (isGiver) role = candidates.find((r) => detection.boonRoles.includes(r));
      else if (isNoGiver) role = candidates.find((r) => !detection.boonRoles.includes(r));
    }
    if (role === undefined) continue;

    const ratio =
      tally.dpsRatios.length > 0
        ? tally.dpsRatios.reduce((a, b) => a + b, 0) / tally.dpsRatios.length
        : null;
    // Only the low-damage role has an expectation; for the others "not that low" fits.
    const damageFits =
      ratio === null || detection.lowDamageRole === undefined
        ? null
        : role === detection.lowDamageRole
          ? ratio < LOW_DAMAGE_RATIO
          : ratio >= LOW_DAMAGE_RATIO;

    const bothAgree = boonShare !== null && (isGiver || isNoGiver);
    suggestions.set(account, {
      role,
      certainty: bothAgree && damageFits !== false ? "high" : "medium",
      circleShare,
      circleVotes,
      boonShare,
      boonAttempts: tally.boonAttempts,
      damageFits,
    });
  }
  return suggestions;
}
