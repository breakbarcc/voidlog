import { Cross2Icon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { phaseColor } from "@/components/phase-badge";

// Mechanic and attack glyphs shared by every view that draws mechanics (batch
// timeline, single-log timeline) so one mechanic always looks the same.

export type AttackType =
  | "jaws"
  | "slam"
  | "beam"
  | "shockwave"
  | "scream"
  | "swipe"
  | "green"
  | "spreadBait"
  | "redBait"
  | "invis";

// The glyphs below (attackType/ATTACK_LABEL too) are inherently specific
// to Harvest Temple CM's curated cast markers (see cast-markers.ts on the
// worker) — pending a boss-pluggable icon system, this component only
// draws them for that one boss, so the color lookup is hardcoded to it
// rather than threaded through as a prop.
export const HARVEST_TEMPLE_BOSS_ID = "43488";

// The Greens hazard spawns across three different dragons (Jormag/Primordus/
// Zhaitan), so it can't reuse one dragon's phase color the way the other
// glyphs do — it gets its own fixed, mechanic-appropriate green instead.
const GREEN_SPAWN_COLOR = "#4CA64C";

// Matches the game's own yellow "orange/gold circle" bait indicator.
const SPREAD_BAIT_COLOR = "#E8B84C";
const RED_BAIT_COLOR = "#E0453D";

// Unused by the "invis" glyph itself (an <img>, not a colored SVG shape —
// see AttackGlyph below) — kept only to satisfy ATTACK_COLOR's Record type.
const INVIS_COLOR = "#9B6FE0";

const ATTACK_COLOR: Record<AttackType, string> = {
  jaws: phaseColor(HARVEST_TEMPLE_BOSS_ID, 0, "Primordus"),
  slam: phaseColor(HARVEST_TEMPLE_BOSS_ID, 0, "Primordus"),
  beam: phaseColor(HARVEST_TEMPLE_BOSS_ID, 0, "Kralkatorrik"),
  shockwave: phaseColor(HARVEST_TEMPLE_BOSS_ID, 0, "Mordremoth"),
  scream: phaseColor(HARVEST_TEMPLE_BOSS_ID, 0, "Zhaitan"),
  swipe: phaseColor(HARVEST_TEMPLE_BOSS_ID, 0, "Soo-Won"),
  green: GREEN_SPAWN_COLOR,
  spreadBait: SPREAD_BAIT_COLOR,
  redBait: RED_BAIT_COLOR,
  invis: INVIS_COLOR,
};

// One small glyph per boss attack, drawn in the dragon's own color — sits
// in its own lane above the phase bar so it reads as "the boss did this",
// distinct in both position and color from the fail/death lane below.
export function AttackGlyph({ type, flipped }: Readonly<{ type: AttackType; flipped?: boolean }>) {
  const color = ATTACK_COLOR[type];
  if (type === "jaws") {
    return (
      <svg viewBox="0 0 12 12" width="13" height="13" className="opacity-70">
        <path
          d="M1 3 L6 6 L1 9"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11 3 L6 6 L11 9"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "slam") {
    return (
      <svg viewBox="0 0 12 12" width="13" height="13" className="opacity-70">
        <rect x="2.5" y="2.5" width="7" height="7" fill={color} transform="rotate(45 6 6)" />
      </svg>
    );
  }
  if (type === "beam") {
    return (
      <svg
        viewBox="0 0 12 12"
        width="13"
        height="13"
        className="opacity-70"
        style={{ transform: flipped ? "scaleX(-1)" : undefined }}
      >
        <path
          d="M3 2 L8 6 L3 10"
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "shockwave") {
    return (
      <svg viewBox="0 0 12 12" width="13" height="13" className="opacity-70">
        <circle cx="6" cy="6" r="2" fill={color} />
        <circle cx="6" cy="6" r="4.6" fill="none" stroke={color} strokeWidth="1.3" opacity="0.55" />
      </svg>
    );
  }
  if (type === "scream") {
    return (
      <svg viewBox="0 0 12 12" width="13" height="13" className="opacity-70">
        <path
          d="M1 6 Q3 2 5 6 T9 6 T13 6"
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "swipe") {
    // The attack's telegraph: a big half circle in front of Soo-Won with the
    // direction it sweeps in drawn as short rays fanning out of it.
    return (
      <svg viewBox="0 0 14 14" width="15" height="15" className="opacity-80">
        <path d="M2.4 12.2 A4.6 4.6 0 0 1 11.6 12.2 Z" fill={color} />
        <path
          d="M11.9 9.9 L13.3 9.3 M9.9 7.7 L10.8 6.4 M7.0 6.8 L7.0 5.3 M4.1 7.7 L3.2 6.4 M2.1 9.9 L0.7 9.3"
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "green") {
    // Three small circles — the Greens hazard always spawns as multiple
    // simultaneous stack points, unlike the other single-target casts.
    return (
      <svg viewBox="0 0 12 12" width="13" height="13" className="opacity-70">
        <circle cx="3" cy="8.5" r="1.6" fill={color} />
        <circle cx="6" cy="3.5" r="1.6" fill={color} />
        <circle cx="9" cy="8.5" r="1.6" fill={color} />
      </svg>
    );
  }
  if (type === "invis") {
    // Wiki icon (GW2's own Mass Invisibility skill icon) instead of a
    // hand-drawn glyph — the other markers approximate their attack visually,
    // but a stealth cast doesn't have one, so the game's own icon reads
    // clearer than an abstract shape would.
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fixed-size static icon, next/image is unnecessary overhead here
      <img
        src="/icons/mass-invisibility.png"
        alt=""
        className="h-3.5 w-3.5 rounded-sm opacity-90"
      />
    );
  }
  // "spreadBait"/"redBait": a plain outlined circle — matches the game's
  // own bait-circle indicator, colored per bait type.
  return (
    <svg viewBox="0 0 12 12" width="13" height="13" className="opacity-70">
      <circle cx="6" cy="6" r="4" fill="none" stroke={color} strokeWidth="1.1" />
    </svg>
  );
}

// AttackType's keys match messages/*.json's `attackLabels` namespace 1:1 —
// components needing a label call `useTranslations("attackLabels")(type)`
// directly rather than going through a lookup table here.

// Fires much more often than the named boss casts (per-player,
// repeats constantly) — kept in a separate lane above so it doesn't bury
// Jaws/Slam/Beam/Shockwave/Scream under a wall of overlapping circles.
export const HIGH_FREQUENCY_ATTACK_TYPES = new Set<AttackType>(["green", "spreadBait", "redBait"]);

// Maps a synthetic "*.Cast"/"*.Spawn" mechanicName (or a raw EI mechanic
// treated as a boss-attack marker) to its attack glyph type — the single
// place that connects worker-side cast-markers.ts / boss curation to the
// icon above.
export function attackType(mechanicName: string): AttackType | null {
  if (mechanicName === "Jaws.Cast") return "jaws";
  if (mechanicName === "Slam.Cast") return "slam";
  if (mechanicName === "Beam.Cast") return "beam";
  if (mechanicName === "ShckWv.Cast") return "shockwave";
  if (mechanicName === "Scream.Cast") return "scream";
  if (mechanicName === "ClawSlap.Cast") return "swipe";
  if (mechanicName === "Green.Spawn") return "green";
  if (mechanicName === "Spread.B") return "spreadBait";
  if (mechanicName === "Red.B") return "redBait";
  if (mechanicName === "Invis.Cast") return "invis";
  return null;
}

// A failed Green: a solid green disc with an exclamation mark. Solid and
// round on purpose — the fail lane is full of outlined triangles and red
// crosses (deaths), and the previous strike-through circles disappeared
// between them. Bigger than the other fail icons for the same reason.
function GreenFailGlyph({ size }: Readonly<{ size: "sm" | "md" }>) {
  const px = size === "md" ? 20 : 17;
  return (
    <svg viewBox="0 0 16 16" width={px} height={px} aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill={GREEN_SPAWN_COLOR} stroke="#0d2410" strokeWidth="1.2" />
      <rect x="7" y="3.4" width="2" height="6" rx="1" fill="#fff" />
      <circle cx="8" cy="12" r="1.2" fill="#fff" />
    </svg>
  );
}

export function failMechanicIcon(mechanicName: string, options?: { size?: "sm" | "md" }) {
  // "sm" matches the compact timeline lanes/filter chips (unchanged); "md"
  // is for spots like the phase-summary cards where a 14px glyph at this
  // component's tiny label sizes read as blurry rather than just small.
  const size = options?.size ?? "sm";
  if (mechanicName === "Downed") {
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size static icon, next/image is unnecessary overhead here
    return (
      <img src="/icons/downed.png" alt="" className={size === "md" ? "h-5 w-3" : "h-4 w-2.5"} />
    );
  }
  if (mechanicName === "Debilitated") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fixed-size static icon, next/image is unnecessary overhead here
      <img
        src="/icons/debilitated.png"
        alt=""
        className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"}
      />
    );
  }
  if (mechanicName === "F.Green") return <GreenFailGlyph size={size} />;
  return (
    <ExclamationTriangleIcon
      className={`text-warning ${size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"}`}
    />
  );
}

// Icon for a mechanic's entry inside a hover card. A hit by a boss attack
// shows that attack's own glyph there, so the tooltip ties the hit to the cast
// in the lane above; the fail lane itself keeps the generic warning icon.
// Boss-specific like the glyphs themselves (see HARVEST_TEMPLE_BOSS_ID).
const HIT_ATTACK_GLYPHS: Record<string, AttackType> = {
  "Claw.H": "swipe",
  "Red.H": "redBait",
};

export function tooltipMechanicIcon(mechanicName: string) {
  const attack = HIT_ATTACK_GLYPHS[mechanicName];
  return attack ? <AttackGlyph type={attack} /> : failMechanicIcon(mechanicName);
}

/** A player's death marker — the red cross used in every timeline. */
export function DeathIcon({ className }: Readonly<{ className?: string }>) {
  return <Cross2Icon className={className ?? "text-danger h-3.5 w-3.5"} />;
}
