import type { Locale } from "@/i18n/locale";
import { getBossCuration } from "./bosses/registry";

/**
 * Best-effort fallback for raw names not in a boss's curated map: split
 * "Foo.Bar.H" into "Foo Bar" and expand the trailing suffix code, so an
 * unmapped mechanic still reads as words instead of an opaque EI code.
 * Suffix meanings: .H = Hit, .B = Bait, .D = Debuff, .CC = crowd control,
 * .L/.K = achievement Lost/Kept — see lib/bosses/harvest-temple.ts for
 * how these were verified against EI's own source.
 */
const SUFFIX_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    H: "hit",
    B: "bait",
    D: "debuff received",
    CC: "stunned",
    L: "achievement missed",
    K: "achievement kept",
  },
  de: {
    H: "getroffen",
    B: "Köder (Bait)",
    D: "Debuff erhalten",
    CC: "betäubt",
    L: "Erfolg verpasst",
    K: "Erfolg erhalten",
  },
};

const PRESUMED_SUFFIX: Record<Locale, string> = {
  en: "presumed",
  de: "vermutlich",
};

function humanizeFallback(locale: Locale, mechanicName: string): string {
  const parts = mechanicName.split(".");
  const suffix = parts.at(-1);
  const label = suffix ? SUFFIX_LABELS[locale][suffix] : undefined;
  const stem = (label ? parts.slice(0, -1) : parts).join(" ");
  const presumed = PRESUMED_SUFFIX[locale];
  return label ? `${stem} — ${label} (${presumed})` : `${stem} (${presumed})`;
}

/**
 * `curatedDisplayName` is the worker's own `MechanicEvent.displayName` —
 * only meaningful when a per-boss `BossConfig.mechanics` mapping actually
 * curated it (ADR-009); otherwise the worker just falls back to the raw
 * `mechanicName`, so it's indistinguishable from "no curation" here. When
 * it *is* curated (differs from the raw name), prefer it over our own
 * best-effort guess — it was hand-authored for that specific boss.
 */
export function translateMechanicName(
  bossId: string,
  locale: Locale,
  mechanicName: string,
  curatedDisplayName?: string,
): string {
  const curated = getBossCuration(bossId)?.mechanicNames[locale][mechanicName];
  if (curated) return curated;
  if (curatedDisplayName && curatedDisplayName !== mechanicName) return curatedDisplayName;
  return humanizeFallback(locale, mechanicName);
}
