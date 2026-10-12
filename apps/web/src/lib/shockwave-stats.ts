import { getBossCuration } from "./bosses/registry";
import type { ShockwaveConfig } from "./bosses/types";

/**
 * Per-player shockwave statistics counted per *shockwave*, not per attempt:
 * how many shockwaves a player actually played (was alive for) and how many
 * of those hit them. Attempts of different length therefore weigh in
 * proportion to the shockwaves they contained, and sums over attempts or
 * players can be divided directly.
 *
 * Source of truth for the number of shockwaves is the boss's own cast log
 * (`BossCuration.shockwave.castMechanic`, synthesized by the worker's
 * cast-markers.ts) — independent of whether anybody got hit. One cast can
 * produce several hit events for the same player, so hits are attributed to
 * the cast that preceded them and every cast counts at most once per player.
 *
 * Two views: per player (`countShockwaves`/`encounterShockwaves` — how did
 * *I* play) and per squad (`squadShockwaves` — how many waves did the raid
 * fail, one failed wave no matter how many players it hit).
 */

export interface ShockwaveEvent {
  mechanicName: string;
  timeMs: number;
}

export interface ShockwaveCount {
  /** Shockwaves the player took part in: cast while alive (or that hit them). */
  played: number;
  /** Of those, the ones that hit the player at least once. */
  hit: number;
}

// EI's generic death/revive mechanics — a player is dead from "Dead" until a
// following "Resp" (respawn), if any.
const DEATH = "Dead";
const RESPAWN = "Resp";

export function shockwaveConfig(bossId: string): ShockwaveConfig | undefined {
  return getBossCuration(bossId)?.shockwave;
}

/** Cast timestamps of the boss's shockwaves in one encounter, ascending. */
export function shockwaveCastTimes(bossId: string, events: readonly ShockwaveEvent[]): number[] {
  const config = shockwaveConfig(bossId);
  if (!config) return [];
  return events
    .filter((e) => e.mechanicName === config.castMechanic)
    .map((e) => e.timeMs)
    .sort((a, b) => a - b);
}

/** Indices into the encounter's cast list a player played / was hit by. */
interface PlayerCasts {
  played: Set<number>;
  hit: Set<number>;
}

function playerCasts(
  config: ShockwaveConfig,
  castTimes: readonly number[],
  playerEvents: readonly ShockwaveEvent[],
): PlayerCasts {
  if (castTimes.length === 0) return { played: new Set(), hit: new Set() };

  // Hits -> the cast that produced them. Hits with no cast just before them
  // (a different source) are not attributable and are left out.
  const hitCasts = new Set<number>();
  for (const e of playerEvents) {
    if (e.mechanicName !== config.hitMechanic) continue;
    let index = -1;
    for (let i = 0; i < castTimes.length && castTimes[i]! <= e.timeMs; i++) index = i;
    if (index >= 0 && e.timeMs - castTimes[index]! <= config.hitWindowMs) hitCasts.add(index);
  }

  const lifecycle = playerEvents
    .filter((e) => e.mechanicName === DEATH || e.mechanicName === RESPAWN)
    .sort((a, b) => a.timeMs - b.timeMs);
  const played = new Set<number>();
  let next = 0;
  let dead = false;
  castTimes.forEach((castMs, index) => {
    while (next < lifecycle.length && lifecycle[next]!.timeMs <= castMs) {
      dead = lifecycle[next]!.mechanicName === DEATH;
      next += 1;
    }
    // Hit although "dead" (e.g. a missing respawn) — they were clearly there.
    if (!dead || hitCasts.has(index)) played.add(index);
  });
  return { played, hit: hitCasts };
}

/**
 * Counts one player's shockwaves in one encounter. `playerEvents` are that
 * player's own mechanic events (hits, Dead, Resp — others are ignored),
 * `castTimes` the encounter's shockwave casts from `shockwaveCastTimes`.
 */
export function countShockwaves(
  bossId: string,
  castTimes: readonly number[],
  playerEvents: readonly ShockwaveEvent[],
): ShockwaveCount {
  const config = shockwaveConfig(bossId);
  if (!config) return { played: 0, hit: 0 };
  const casts = playerCasts(config, castTimes, playerEvents);
  return { played: casts.played.size, hit: casts.hit.size };
}

/**
 * Counts every player of one encounter at once. `events` may carry events of
 * all players plus the boss's casts (`playerKey` null); `playerKeys` are the
 * players to report — the key is whatever identifies a player to the caller
 * (account, result id), as long as it is the same in both places.
 */
export function encounterShockwaves(
  bossId: string,
  events: readonly (ShockwaveEvent & { playerKey: string | null })[],
  playerKeys: Iterable<string>,
): Map<string, ShockwaveCount> {
  const castTimes = shockwaveCastTimes(bossId, events);
  const byPlayer = new Map<string, ShockwaveEvent[]>();
  for (const e of events) {
    if (e.playerKey === null) continue;
    const list = byPlayer.get(e.playerKey) ?? [];
    list.push(e);
    byPlayer.set(e.playerKey, list);
  }
  const result = new Map<string, ShockwaveCount>();
  for (const key of playerKeys) {
    result.set(key, countShockwaves(bossId, castTimes, byPlayer.get(key) ?? []));
  }
  return result;
}

/**
 * The squad's shockwaves in one encounter: every shockwave anybody played
 * counts once, and it counts as failed as soon as it hit at least one player
 * (so 5 players hit by the same wave are still one failed wave). The numbers
 * are the ones a raid actually experienced, unlike the per-player sum, which
 * counts every wave once per player. Arguments as for `encounterShockwaves`.
 */
export function squadShockwaves(
  bossId: string,
  events: readonly (ShockwaveEvent & { playerKey: string | null })[],
  playerKeys: Iterable<string>,
): ShockwaveCount {
  const config = shockwaveConfig(bossId);
  if (!config) return { played: 0, hit: 0 };
  const castTimes = shockwaveCastTimes(bossId, events);
  const byPlayer = new Map<string, ShockwaveEvent[]>();
  for (const e of events) {
    if (e.playerKey === null) continue;
    const list = byPlayer.get(e.playerKey) ?? [];
    list.push(e);
    byPlayer.set(e.playerKey, list);
  }
  const played = new Set<number>();
  const hit = new Set<number>();
  for (const key of playerKeys) {
    const casts = playerCasts(config, castTimes, byPlayer.get(key) ?? []);
    casts.played.forEach((i) => played.add(i));
    casts.hit.forEach((i) => hit.add(i));
  }
  return { played: played.size, hit: hit.size };
}

/** Sum of counts, e.g. over the players of an encounter or the attempts of a night. */
export function addShockwaveCounts(a: ShockwaveCount, b: ShockwaveCount): ShockwaveCount {
  return { played: a.played + b.played, hit: a.hit + b.hit };
}

/** Hit share in percent (rounded), null when no shockwave was played. */
export function shockwavePercent(count: ShockwaveCount): number | null {
  return count.played > 0 ? Math.round((count.hit / count.played) * 100) : null;
}
