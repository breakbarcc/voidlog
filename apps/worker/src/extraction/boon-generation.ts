import type { EiPlayer } from "./ei-json-shape";

/** EI buff ids (the `buffMap` "b<id>" keys) of the two boons squads are built around. */
const QUICKNESS_BUFF_ID = 1187;
const ALACRITY_BUFF_ID = 30328;

/**
 * What a player generated of Quickness and Alacrity for their group over the
 * whole fight (`groupBuffs[].buffData[0].generation`). A boon is null when EI
 * reported no entry for it, so "gave nothing" (0) and "not captured" (null)
 * stay apart — the role detection only counts what was actually measured.
 */
export function boonGeneration(player: Pick<EiPlayer, "groupBuffs">): {
  quicknessGeneration: number | null;
  alacrityGeneration: number | null;
} {
  const generationOf = (buffId: number): number | null => {
    const generation = player.groupBuffs?.find((b) => b.id === buffId)?.buffData?.[0]?.generation;
    return typeof generation === "number" && Number.isFinite(generation) ? generation : null;
  };
  return {
    quicknessGeneration: generationOf(QUICKNESS_BUFF_ID),
    alacrityGeneration: generationOf(ALACRITY_BUFF_ID),
  };
}
