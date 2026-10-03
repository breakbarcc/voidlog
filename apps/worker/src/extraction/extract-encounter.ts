import type { Readable } from "node:stream";
// stream-json is a CommonJS package (`export =`); Node's ESM interop does
// not reliably expose its `.parser` property as a named export, so this
// must be a default import, not `import { parser } from "stream-json"`.
import createTokenParser from "stream-json";
import type { EiPlayer, EiRoot, EiTarget } from "./ei-json-shape";
import { type JsonToken, type JsonValue, SkipTracker, ValueBuilder } from "./value-builder";

/**
 * Selective/streaming extraction of an EI JSON report (ADR-008): the
 * response can be tens of MB, almost entirely `players`/`targets` data we
 * don't need. This never materializes the full document. It keeps a
 * fixed, small set of root fields whole, iterates `players` one element
 * at a time, and within each player keeps only a fixed field list —
 * everything else (including all of `targets`) is skipped without ever
 * being assembled into a JS value.
 */

const ROOT_KEEP_WHOLE = new Set([
  "duration",
  "durationMS",
  "success",
  "isCM",
  "phases",
  "mechanics",
  "fightName",
  "triggerID",
  // Small (tens of KB): id -> name lookup for the skill ids in `targets[].rotation`.
  "skillMap",
  "timeStartStd",
]);

// "rotation"/"buffUptimesActive" are transient inputs for the stealth-phase
// synthesis in persist-encounter.ts (see boss-configs/stealth-phases.ts) —
// each is a bounded per-player field (tens of KB, not the tens-of-MB problem
// this module exists to avoid), never persisted wholesale.
const PLAYER_KEEP_WHOLE = new Set([
  "account",
  "name",
  "profession",
  "group",
  "dpsAll",
  "defenses",
  "rotation",
  "buffUptimesActive",
]);

// `targets[]` also carries per-target damage/buff/combat-replay breakdowns
// (the bulk of the JSON's ~1MB `targets` payload) — keep only the cast log
// ("rotation") used to detect boss-ability casts independent of whether a
// player got hit (unlike `mechanics[]`, which only records hits).
const TARGET_KEEP_WHOLE = new Set([
  "name",
  "id",
  "rotation",
  "healthPercentBurned",
  "finalHealth",
  "totalHealth",
  "lastAware",
]);

type State =
  | "expect-root-start"
  | "root-key"
  | "root-value-dispatch"
  | "filling-root-keep"
  | "skipping-root"
  | "in-players-array"
  | "player-key"
  | "player-value-dispatch"
  | "filling-player-keep"
  | "skipping-player"
  | "in-targets-array"
  | "target-key"
  | "target-value-dispatch"
  | "filling-target-keep"
  | "skipping-target"
  | "done";

export interface ExtractedEncounter {
  root: EiRoot;
  players: EiPlayer[];
  targets: EiTarget[];
}

export function extractEncounterFromStream(jsonStream: Readable): Promise<ExtractedEncounter> {
  return new Promise((resolve, reject) => {
    // stream-json packs keys/strings/numbers into single combined events
    // by default, but ALSO still emits the underlying start*/stringChunk/
    // end* streaming events unless streaming is explicitly turned off.
    // The state machine below only understands the packed events.
    const tokenStream = jsonStream.pipe(
      createTokenParser({
        packKeys: true,
        packStrings: true,
        packNumbers: true,
        streamKeys: false,
        streamStrings: false,
        streamNumbers: false,
      }),
    );

    let state: State = "expect-root-start";
    const root: Record<string, JsonValue> = {};
    let currentRootKey: string | undefined;
    let rootBuilder: ValueBuilder | undefined;
    let rootSkip: SkipTracker | undefined;

    let currentPlayer: Record<string, JsonValue> | undefined;
    let currentPlayerKey: string | undefined;
    let playerBuilder: ValueBuilder | undefined;
    let playerSkip: SkipTracker | undefined;
    const players: EiPlayer[] = [];

    let currentTarget: Record<string, JsonValue> | undefined;
    let currentTargetKey: string | undefined;
    let targetBuilder: ValueBuilder | undefined;
    let targetSkip: SkipTracker | undefined;
    const targets: EiTarget[] = [];

    function handleToken(token: JsonToken): void {
      switch (state) {
        case "expect-root-start":
          if (token.name !== "startObject") {
            throw new Error(`Expected EI JSON root to be an object, got "${token.name}"`);
          }
          state = "root-key";
          return;

        case "root-key":
          if (token.name === "endObject") {
            state = "done";
            return;
          }
          if (token.name !== "keyValue") {
            throw new Error(`Expected a root object key, got "${token.name}"`);
          }
          currentRootKey = String(token.value);
          state = "root-value-dispatch";
          return;

        case "root-value-dispatch": {
          const key = currentRootKey as string;
          if (key === "players") {
            if (token.name !== "startArray") {
              throw new Error('Expected "players" to be an array');
            }
            state = "in-players-array";
            return;
          }
          if (key === "targets") {
            if (token.name !== "startArray") {
              throw new Error('Expected "targets" to be an array');
            }
            state = "in-targets-array";
            return;
          }
          if (ROOT_KEEP_WHOLE.has(key)) {
            rootBuilder = new ValueBuilder();
            rootBuilder.push(token);
            if (rootBuilder.done) {
              root[key] = rootBuilder.value;
              rootBuilder = undefined;
              state = "root-key";
            } else {
              state = "filling-root-keep";
            }
          } else {
            rootSkip = new SkipTracker();
            rootSkip.push(token);
            if (rootSkip.done) {
              rootSkip = undefined;
              state = "root-key";
            } else {
              state = "skipping-root";
            }
          }
          return;
        }

        case "filling-root-keep":
          rootBuilder!.push(token);
          if (rootBuilder!.done) {
            root[currentRootKey as string] = rootBuilder!.value;
            rootBuilder = undefined;
            state = "root-key";
          }
          return;

        case "skipping-root":
          rootSkip!.push(token);
          if (rootSkip!.done) {
            rootSkip = undefined;
            state = "root-key";
          }
          return;

        case "in-players-array":
          if (token.name === "endArray") {
            state = "root-key";
            return;
          }
          if (token.name !== "startObject") {
            throw new Error(`Expected a player object, got "${token.name}"`);
          }
          currentPlayer = {};
          state = "player-key";
          return;

        case "player-key":
          if (token.name === "endObject") {
            players.push(currentPlayer as unknown as EiPlayer);
            currentPlayer = undefined;
            state = "in-players-array";
            return;
          }
          if (token.name !== "keyValue") {
            throw new Error(`Expected a player object key, got "${token.name}"`);
          }
          currentPlayerKey = String(token.value);
          state = "player-value-dispatch";
          return;

        case "player-value-dispatch": {
          const key = currentPlayerKey as string;
          if (PLAYER_KEEP_WHOLE.has(key)) {
            playerBuilder = new ValueBuilder();
            playerBuilder.push(token);
            if (playerBuilder.done) {
              currentPlayer![key] = playerBuilder.value;
              playerBuilder = undefined;
              state = "player-key";
            } else {
              state = "filling-player-keep";
            }
          } else {
            playerSkip = new SkipTracker();
            playerSkip.push(token);
            if (playerSkip.done) {
              playerSkip = undefined;
              state = "player-key";
            } else {
              state = "skipping-player";
            }
          }
          return;
        }

        case "filling-player-keep":
          playerBuilder!.push(token);
          if (playerBuilder!.done) {
            currentPlayer![currentPlayerKey as string] = playerBuilder!.value;
            playerBuilder = undefined;
            state = "player-key";
          }
          return;

        case "skipping-player":
          playerSkip!.push(token);
          if (playerSkip!.done) {
            playerSkip = undefined;
            state = "player-key";
          }
          return;

        case "in-targets-array":
          if (token.name === "endArray") {
            state = "root-key";
            return;
          }
          if (token.name !== "startObject") {
            throw new Error(`Expected a target object, got "${token.name}"`);
          }
          currentTarget = {};
          state = "target-key";
          return;

        case "target-key":
          if (token.name === "endObject") {
            targets.push(currentTarget as unknown as EiTarget);
            currentTarget = undefined;
            state = "in-targets-array";
            return;
          }
          if (token.name !== "keyValue") {
            throw new Error(`Expected a target object key, got "${token.name}"`);
          }
          currentTargetKey = String(token.value);
          state = "target-value-dispatch";
          return;

        case "target-value-dispatch": {
          const key = currentTargetKey as string;
          if (TARGET_KEEP_WHOLE.has(key)) {
            targetBuilder = new ValueBuilder();
            targetBuilder.push(token);
            if (targetBuilder.done) {
              currentTarget![key] = targetBuilder.value;
              targetBuilder = undefined;
              state = "target-key";
            } else {
              state = "filling-target-keep";
            }
          } else {
            targetSkip = new SkipTracker();
            targetSkip.push(token);
            if (targetSkip.done) {
              targetSkip = undefined;
              state = "target-key";
            } else {
              state = "skipping-target";
            }
          }
          return;
        }

        case "filling-target-keep":
          targetBuilder!.push(token);
          if (targetBuilder!.done) {
            currentTarget![currentTargetKey as string] = targetBuilder!.value;
            targetBuilder = undefined;
            state = "target-key";
          }
          return;

        case "skipping-target":
          targetSkip!.push(token);
          if (targetSkip!.done) {
            targetSkip = undefined;
            state = "target-key";
          }
          return;

        case "done":
          return;
      }
    }

    tokenStream.on("data", (token: JsonToken) => {
      try {
        handleToken(token);
      } catch (err) {
        tokenStream.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    tokenStream.on("error", (err: Error) => reject(err));

    tokenStream.on("end", () => {
      if (typeof root.success !== "boolean") {
        reject(new Error('EI JSON root is missing required boolean field "success"'));
        return;
      }
      if (!Array.isArray(root.phases) || root.phases.length === 0) {
        reject(new Error('EI JSON root is missing a non-empty "phases" array'));
        return;
      }
      resolve({ root: root as unknown as EiRoot, players, targets });
    });
  });
}
