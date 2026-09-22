import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/i18n/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BCP47_TAG: Record<Locale, string> = {
  en: "en-US",
  de: "de-DE",
};

/** Locale-aware date formatting — use instead of hardcoding "de-DE" everywhere. */
export function formatDate(date: Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(BCP47_TAG[locale], options);
}

/**
 * Locale-aware date *and* time formatting. `toLocaleDateString` (formatDate
 * above) throws on a `timeStyle` option — it's date-only by design — so a
 * combined date+time needs `toLocaleString` instead.
 */
export function formatDateTime(
  date: Date,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleString(BCP47_TAG[locale], options);
}

/** Locale-aware number formatting (thousands separators etc.). */
export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(BCP47_TAG[locale]);
}
