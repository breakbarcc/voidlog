export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];

// English is the fallback/default everywhere — unset cookie, unrecognized
// cookie value, or an Accept-Language header that isn't clearly German.
export const defaultLocale: Locale = "en";

// Shared with the breakbar.cc main site — written with `Domain=.breakbar.cc`
// in production (see language-switcher.tsx) so the language choice made on
// either site stays in sync across subdomains.
export const LOCALE_COOKIE_NAME = "breakbar-language";

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
