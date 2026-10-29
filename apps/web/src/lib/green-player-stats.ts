import { greenRole, readGreenWave } from "./green-details";
import { listBossCurations } from "./bosses/registry";
import { greensConfig } from "./green-stats";

/**
 * Greens per player: in every wave, the player's role (lib/player-roles.ts)
 * owns one circle of the phase (`GreensConfig.roles`), and the worker
 * recorded which characters stood in each circle when it resolved (sampled
 * from the combat replay positions — EI has no buff or per-player mechanic
 * for it, see worker extraction/green-waves.ts). A player who wasn't in
 * their circle missed it.
 *
 * Not counted:
 * - waves whose phase has no circle for the player's role (DPS and the
 *   Venticator, who shares theirs, outside Soo-Won 1), and players without a role;
 * - circles without a known position (`insideKnown`) — nothing to tell;
 * - players downed or dead when the circle resolved: they couldn't stand in
 *   it, so they're counted apart (`unavailable`) instead of as a miss.
 */

export interface PlayerGreenCount {
  /** Waves in which the player was up and their role had a circle. */
  expected: number;
  /** Of those, the ones in which the player wasn't in their circle. */
  missed: number;
  /** Waves the player's circle resolved while they were downed or dead. */
  unavailable: number;
}

export const EMPTY_PLAYER_GREENS: PlayerGreenCount = { expected: 0, missed: 0, unavailable: 0 };

// EI's generic downstate/death mechanics and the ones ending them.
const UNAVAILABLE = new Set(["Downed", "Dead"]);
const AVAILABLE_AGAIN = new Set(["Got up", "Res", "Resp"]);

/** The player-side events `playerGreens` reads: downs, deaths and getting back up. */
export const GREEN_LIFECYCLE_MECHANICS: readonly string[] = [...UNAVAILABLE, ...AVAILABLE_AGAIN];

/** The boss-side event carrying a wave's circles (Green.Spawn), across all curated bosses. */
export function greenWaveMechanicNames(): string[] {
  return listBossCurations().flatMap((boss) => (boss.greens ? [boss.greens.castMechanic] : []));
}

interface Event {
  mechanicName: string;
  timeMs: number;
}

function unavailableAt(lifecycle: readonly Event[], timeMs: number): boolean {
  let unavailable = false;
  for (const event of lifecycle) {
    // Strictly before: a failed wave downs the squad at the moment it resolves.
    if (event.timeMs >= timeMs) break;
    if (UNAVAILABLE.has(event.mechanicName)) unavailable = true;
    else if (AVAILABLE_AGAIN.has(event.mechanicName)) unavailable = false;
  }
  return unavailable;
}

/**
 * One player's Greens in one encounter. `bossEvents` are the encounter's
 * boss-side events (the wave markers with their `context`), `playerEvents`
 * the player's own (only the lifecycle ones are read).
 */
export function playerGreens(
  bossId: string,
  bossEvents: readonly (Event & { context: unknown })[],
  playerEvents: readonly Event[],
  characterName: string,
  role: string | null,
): PlayerGreenCount {
  const config = greensConfig(bossId);
  const count = { ...EMPTY_PLAYER_GREENS };
  if (!config || role === null) return count;

  // A role without circles of its own stands in the one it shares.
  const circleRole = config.sharedCircles?.[role] ?? role;
  const lifecycle = playerEvents
    .filter((e) => UNAVAILABLE.has(e.mechanicName) || AVAILABLE_AGAIN.has(e.mechanicName))
    .toSorted((a, b) => a.timeMs - b.timeMs);

  for (const event of bossEvents) {
    if (event.mechanicName !== config.castMechanic) continue;
    const wave = readGreenWave(event.context);
    const circle = wave?.circles.find((c) => greenRole(bossId, wave.phase, c.label) === circleRole);
    if (!circle?.insideKnown) continue;
    if (circle.inside.includes(characterName)) {
      count.expected += 1;
    } else if (unavailableAt(lifecycle, event.timeMs)) {
      count.unavailable += 1;
    } else {
      count.expected += 1;
      count.missed += 1;
    }
  }
  return count;
}

export function addPlayerGreens(into: PlayerGreenCount, add: PlayerGreenCount): void {
  into.expected += add.expected;
  into.missed += add.missed;
  into.unavailable += add.unavailable;
}
