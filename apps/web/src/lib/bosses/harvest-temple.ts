import type { Locale } from "@/i18n/locale";
import type { BossCuration } from "./types";

/**
 * Harvest Temple CM (Dragon's End, Soo-Won) — bossId 43488. See
 * docs/ADR-GW2-Log-Analyse-Plattform.md ADR-009 for why this is
 * hand-curated code rather than an editable DB table.
 */

const MAIN_PHASE_NAMES = [
  "Jormag",
  "Primordus",
  "Kralkatorrik",
  "Mordremoth",
  "Giants",
  "Zhaitan",
  "Soo-Won",
];

// Elder Dragon phases get their design-matched color instead of the
// generic cyclic palette, per each dragon's theme.
const DRAGON_COLORS: Record<string, string> = {
  Jormag: "#5FC9E8", // ice
  Primordus: "#E8734C", // molten fire
  Kralkatorrik: "#A98FDB", // crystal
  Mordremoth: "#4CA64C", // toxic growth
  Zhaitan: "#6B4C8A", // undead plague
  "Soo-Won": "#3DBFA6", // pearlescent water
};

// Intermission phases between dragons — shown in the timeline but not
// tied to any dragon's theme, so they get a neutral color instead.
const PURIFICATION_COLOR = "#2e2845";

/**
 * Human-readable German names for raw EI mechanic names (the
 * `mechanicName` field, e.g. "J.Breath.H"). These short codes come
 * straight from EI's boss-specific mechanic definitions in
 * `GW2EIEvtcParser` — verified against that source, not guessed. Each
 * entry there defines (short code, description, display name), e.g.:
 *
 *   new PlayerDstHealthDamageHitMechanic(BreathOfJormag, ..., "J.Breath.H",
 *     "Hit by Jormag Breath", "Jormag Breath", Sev1, 150)
 *
 * The suffix codes mean: .H = Hit (getroffen), .B = Bait (intentionally
 * assigned to solo-take a mechanic — not a fail, see noiseMechanicNames),
 * .D = Debuff received, .CC = crowd-controlled/stunned, .L/.K =
 * achievement Lost/Kept.
 *
 * Entries not sourced from EI's Harvest Temple definitions (generic
 * cross-encounter mechanics like "Dead"/"Downed", or codes not yet seen
 * in this list) are marked "(vermutlich)" — best-effort guess, not
 * verified.
 */
const MECHANIC_NAMES_DE: Record<string, string> = {
  // Generic, cross-encounter (not from the Harvest Temple mechanic list)
  Dead: "Gestorben",
  Downed: "Downstate",
  Res: "Wiederbelebt",
  Resp: "Wiederbelebung",
  "Got up": "Aufgestanden",
  DC: "Disconnect",
  Lckt: "Anvisiert (vermutlich)",
  Lnch: "Hochgeschleudert (vermutlich)",
  "Knck.Dwn": "Knockdown",
  "Knck.Pll": "Weggezogen (Pull, vermutlich)",
  Debilitated: "Geschwächt (Debilitated)",
  Infirmity: "Gebrechlichkeit (Infirmity)",
  // Invisible-Phase-Mechanik (nach Jormag/Primordus/Mordremoth, siehe
  // worker/src/boss-configs/stealth-phases.ts): ein Spieler castet Mass
  // Invisibility, wer danach zu früh angreift, bricht die Unsichtbarkeit
  // und erhält Revealed.
  "Invis.Cast": "Massenunsichtbarkeit gecastet",
  Revealed: "Aufgedeckt (Revealed)",

  // General (Harvest Temple, all phases)
  "Spread.B": "Spread Bait",
  "Red.B": "Red Bait",
  "Void.D": "Void-Debuff erhalten",
  "Void.H": "Void — getroffen",
  "Red.H": "Red Hit",
  "Spread.H": "Spread Hit",
  "Orb Push": "Orb gestoßen",
  "NopeRopes.Achiv.L": "Erfolg „Nope Ropes“ verpasst",
  "NopeRopes.Achiv.K": "Erfolg „Nope Ropes“ behalten",
  "VoidExp.H": "Void-Explosion — getroffen",
  "VoidExp.Champ.H": "Void-Explosion (Champion) — getroffen",
  "MagicDisc.H": "Magieentladung — getroffen",
  "S.Green": "Greens — erfolgreich",
  "F.Green": "Greens — verfehlt",
  // Synthetic marker (not a raw EI mechanic) — one per Greens occurrence,
  // clustered from S.Green/F.Green timestamps (see
  // CLUSTER_SPAWN_MARKERS_BY_BOSS in the worker's cast-markers.ts). Labeled
  // "aufgelöst" (resolved), not "erscheinen" (spawn): S.Green/F.Green only
  // fire when the mechanic resolves pass/fail, ~6.3s after the circles
  // actually appear (confirmed via EiTarget.firstAware vs. the first
  // S.Green timestamp on a real log) — the true spawn instant isn't
  // available from this data source. Only exists for Jormag/Primordus/
  // Zhaitan — Kralkatorrik/Mordremoth/Soo-Won don't have this mechanic.
  "Green.Spawn": "Greens — aufgelöst",

  // Purification 1
  "Light.H": "Blitz Jormags — getroffen",
  "Flame.H": "Flammen Primordus' — getroffen",
  "Storm.H": "Kralkatorriks Sturmfall — getroffen",

  // Jormag
  "J.Breath.H": "Atem Jormags — getroffen",
  "J.Grasp.H": "Griff Jormags — getroffen",
  "J.Meteor.H": "Meteor Jormags — getroffen",

  // Primordus
  "Slam.H": "Lava Slam (Chin) Hit",
  "Jaws.H": "Kiefer der Zerstörung (Bite) Hit",
  // Synthetic markers (not a raw EI mechanic) — every cast from the boss's
  // own cast log (targets[].rotation), not just the ones that hit.
  "Jaws.Cast": "Kiefer der Zerstörung (Bite)",
  "Slam.Cast": "Lava Slam (Chin)",

  // Kralkatorrik
  "Barrage.H": "Meteor Hit",
  "Beam.H": "Gebrandeter Strahl",
  "Beam.Cast": "Branding Beam",
  "Artillery.H": "Brandbomber-Artillerie — getroffen",
  "K.Pool.H": "Kralkatorriks Void-Pool — getroffen",

  // Purification 2
  "Goop.H": "Herz-Schleim — getroffen",
  "Bees.H": "Bienen des Herzens Hit",
  "Grav.Cru.H": "Schwerkraft-Zerquetschen — getroffen",
  "NigEpoch.H": "Alptraum-Epoche — getroffen",

  // Mordremoth
  "ShckWv.H": "Mordremoths Schockwelle — getroffen",
  "ShckWv.Start": "Mordremoths Schockwelle — gestartet",
  "ShckWv.Cast": "Mordremoths Schockwelle — Angriff",
  "M.Poison.H": "Mordremoths Giftgebrüll Hit",
  "Kick.H": "Tritt des Void-Schädelspalters",
  "ChrgShot.H": "Schädelspalters Schuss",

  // Giants
  "Scream.G.CC": "Todesschrei des Riesen — betäubt",
  "RotBile.H": "Fauliger Auswurf des Riesen — getroffen",
  "Stomp.CC": "Stampfer des Riesen — betäubt",

  // Zhaitan
  "Scream.H": "Zhaitans Scream",
  "Scream.Cast": "Zhaitans Schrei — Angriff",
  "Z.Poison.H": "Gift Zhaitans — getroffen",
  "T.Slam.H": "Schwanzschlag Zhaitans — getroffen",

  // Purification 3
  "Prjtile.H": "Herz-Geschoss (Corrupted Waters) — getroffen",
  "Whrlpl.H": "Hydro-Ausbruch (Whirlpool) — getroffen",
  "CallLigh.H": "Herbeigerufener Blitz — getroffen",
  "FrozFury.H": "Gefrorene Wut — getroffen",
  "RollFlame.H": "Rollende Flamme — getroffen",
  "ShatEarth.H": "Erdbeben (Shatter Earth) — getroffen",

  // Soo-Won
  "Tsunami.H": "Soo-Wons Tsunami — getroffen",
  "Claw.H": "Klaue Soo-Wons — getroffen",
  "SW.Pool.H": "Soo-Wons Void-Pool — getroffen",
  "Tail.H": "Schwanz Soo-Wons — getroffen",
  "Torment.H": "Qual der Leere (Torment of the Void) — getroffen",
  "MagHail.H": "Magischer Hagel — getroffen",
  "Firebomb.H": "Feuerbombe — getroffen",
  "WyvBreath.H": "Wyvernatem — getroffen",
  "Charge.H": "Ansturm des Vernichters — getroffen",
  "Charge.CC": "Ansturm des Vernichters — betäubt",
  "GlaSlam.H": "Eisiger Schlag — getroffen",
  "GlaSlam.CC": "Eisiger Schlag — betäubt",

  // Purification 4
  "GraspVoid.H": "Griff der Leere (finales Orb-Geschoss) — getroffen",
};

// English versions of the above — reconstructed from EI's own mechanic
// descriptions where the German comments already quote them verbatim (e.g.
// "Hit by Jormag Breath"), otherwise translated to match GW2's official
// in-game terminology as closely as possible. Same suffix meanings as the
// German map (see the comment above MECHANIC_NAMES_DE).
const MECHANIC_NAMES_EN: Record<string, string> = {
  Dead: "Dead",
  Downed: "Downed",
  Res: "Revived",
  Resp: "Revive",
  "Got up": "Got up",
  DC: "Disconnect",
  Lckt: "Targeted (presumed)",
  Lnch: "Launched (presumed)",
  "Knck.Dwn": "Knockdown",
  "Knck.Pll": "Pulled (presumed)",
  Debilitated: "Debilitated",
  Infirmity: "Infirmity",
  "Invis.Cast": "Mass Invisibility cast",
  Revealed: "Revealed",

  "Spread.B": "Spread Bait",
  "Red.B": "Red Bait",
  "Void.D": "Void debuff received",
  "Void.H": "Void — hit",
  "Red.H": "Red Hit",
  "Spread.H": "Spread Hit",
  "Orb Push": "Orb pushed",
  "NopeRopes.Achiv.L": "\"Nope Ropes\" achievement missed",
  "NopeRopes.Achiv.K": "\"Nope Ropes\" achievement kept",
  "VoidExp.H": "Void Explosion — hit",
  "VoidExp.Champ.H": "Void Explosion (Champion) — hit",
  "MagicDisc.H": "Magic Discharge — hit",
  "S.Green": "Greens — succeeded",
  "F.Green": "Greens — missed",
  "Green.Spawn": "Greens — resolved",

  // Purification 1
  "Light.H": "Jormag's Lightning — hit",
  "Flame.H": "Primordus's Flame — hit",
  "Storm.H": "Kralkatorrik's Storm Fall — hit",

  // Jormag
  "J.Breath.H": "Jormag Breath — hit",
  "J.Grasp.H": "Jormag's Grasp — hit",
  "J.Meteor.H": "Jormag Meteor — hit",

  // Primordus
  "Slam.H": "Lava Slam (Chin) Hit",
  "Jaws.H": "Jaws of Destruction (Bite) Hit",
  "Jaws.Cast": "Jaws of Destruction (Bite)",
  "Slam.Cast": "Lava Slam (Chin)",

  // Kralkatorrik
  "Barrage.H": "Meteor Hit",
  "Beam.H": "Branding Beam — hit",
  "Beam.Cast": "Branding Beam",
  "Artillery.H": "Branded Artillery — hit",
  "K.Pool.H": "Kralkatorrik's Void Pool — hit",

  // Purification 2
  "Goop.H": "Heart Goop — hit",
  "Bees.H": "Bees of the Heart Hit",
  "Grav.Cru.H": "Gravity Crush — hit",
  "NigEpoch.H": "Nightmare Epoch — hit",

  // Mordremoth
  "ShckWv.H": "Mordremoth's Shockwave — hit",
  "ShckWv.Start": "Mordremoth's Shockwave — started",
  "ShckWv.Cast": "Mordremoth's Shockwave — cast",
  "M.Poison.H": "Mordremoth's Poison Roar Hit",
  "Kick.H": "Void Skullsplitter's Kick",
  "ChrgShot.H": "Skullsplitter's Charged Shot",

  // Giants
  "Scream.G.CC": "Giant's Death Scream — stunned",
  "RotBile.H": "Giant's Rotten Bile — hit",
  "Stomp.CC": "Giant's Stomp — stunned",

  // Zhaitan
  "Scream.H": "Zhaitan's Scream",
  "Scream.Cast": "Zhaitan's Scream — cast",
  "Z.Poison.H": "Zhaitan's Poison — hit",
  "T.Slam.H": "Zhaitan's Tail Slam — hit",

  // Purification 3
  "Prjtile.H": "Heart Projectile (Corrupted Waters) — hit",
  "Whrlpl.H": "Hydro Burst (Whirlpool) — hit",
  "CallLigh.H": "Call Lightning — hit",
  "FrozFury.H": "Frozen Fury — hit",
  "RollFlame.H": "Rolling Flame — hit",
  "ShatEarth.H": "Shatter Earth — hit",

  // Soo-Won
  "Tsunami.H": "Soo-Won's Tsunami — hit",
  "Claw.H": "Soo-Won's Claw — hit",
  "SW.Pool.H": "Soo-Won's Void Pool — hit",
  "Tail.H": "Soo-Won's Tail — hit",
  "Torment.H": "Torment of the Void — hit",
  "MagHail.H": "Magic Hail — hit",
  "Firebomb.H": "Firebomb — hit",
  "WyvBreath.H": "Wyvern Breath — hit",
  "Charge.H": "Destroyer's Charge — hit",
  "Charge.CC": "Destroyer's Charge — stunned",
  "GlaSlam.H": "Glacial Slam — hit",
  "GlaSlam.CC": "Glacial Slam — stunned",

  // Purification 4
  "GraspVoid.H": "Grasp of the Void (final orb projectile) — hit",
};

const MECHANIC_NAMES: Record<Locale, Record<string, string>> = {
  en: MECHANIC_NAMES_EN,
  de: MECHANIC_NAMES_DE,
};

// Raw EI mechanic names that aren't real "boss mechanic fails" and would
// drown out the ones that matter if shown (auto-tracked achievement/res
// events that fire constantly) — filtered out wherever failed-mechanic
// markers are surfaced. "Dead" is handled separately since death events
// feed a dedicated death-marker UI instead of being discarded outright.
const NOISE_MECHANIC_NAMES = new Set([
  "Orb Push",
  "Res",
  "Resp",
  "Got up",
  "Spread.H",
  "J.Breath.H",
  "J.Grasp.H",
  "VoidExp.H", // Last Laugh
  "VoidExp.Champ.H", // Last Laugh Champions
  "NopeRopes.Achiv.L",
  "NopeRopes.Achiv.K",
  "S.Green",
  "NigEpoch.H" // Orb Aura
]);

// The handful of boss-cast markers (see cast-markers.ts on the worker)
// that are individually curated and shown as distinct timeline ticks —
// everything else matching "<Group>.Cast.<skillId>" is bulk-captured for
// later analysis but has no UI treatment yet.
const VISIBLE_CAST_MARKERS = new Set([
  "Jaws.Cast",
  "Slam.Cast",
  "Beam.Cast",
  "ShckWv.Cast",
  "Scream.Cast",
  "Green.Spawn",
  "Spread.B",
  "Red.B",
  // Not a boss-ability cast (see stealth-phases.ts on the worker) but
  // rendered the same way — a distinct timeline tick, not a generic fail.
  "Invis.Cast",
]);

export const harvestTemple: BossCuration = {
  bossId: "43488",
  isMainPhase: (phaseName) =>
    MAIN_PHASE_NAMES.includes(phaseName) || phaseName.startsWith("Purification"),
  phaseColor: (_order, phaseName) => {
    // "Giants" is an intermission like Purification (not itself a dragon),
    // so it gets the same neutral treatment rather than a dragon color.
    if (phaseName.startsWith("Purification") || phaseName === "Giants") return PURIFICATION_COLOR;
    return DRAGON_COLORS[phaseName];
  },
  mechanicNames: MECHANIC_NAMES,
  noiseMechanicNames: NOISE_MECHANIC_NAMES,
  visibleCastMarkers: VISIBLE_CAST_MARKERS,
};
