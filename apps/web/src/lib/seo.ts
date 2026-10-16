import type { Metadata } from "next";
import type { Locale } from "@/i18n/locale";

const OG_LOCALE: Record<Locale, string> = { en: "en_US", de: "de_DE" };

/**
 * Canonical link plus Open Graph and Twitter card tags for a public page, so
 * a shared link renders the same title/description/image everywhere. `path`
 * is resolved against `metadataBase` (see `lib/site.ts`); the preview image
 * comes from `app/opengraph-image.tsx` / `twitter-image.tsx`.
 */
export function shareMetadata({
  title,
  description,
  path,
  locale,
}: Readonly<{
  title: string;
  description?: string;
  path: string;
  locale: Locale;
}>): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  const otherLocale: Locale = locale === "de" ? "en" : "de";
  return {
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: "voidlog",
      locale: OG_LOCALE[locale],
      alternateLocale: [OG_LOCALE[otherLocale]],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
