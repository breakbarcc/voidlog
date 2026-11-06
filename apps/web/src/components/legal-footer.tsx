import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { IMPRINT_URL, MAIN_SITE_URL } from "@/lib/breakbar";
import { PRIVACY } from "@/lib/legal/privacy";

const LINK = "text-muted hover:text-foreground-strong";

/** "A tool of breakbar.cc", the privacy policy and the legal notice (which lives on the main site). */
export async function LegalFooter() {
  const t = await getTranslations("legalFooter");
  const privacyTitle = PRIVACY[(await getLocale()) as Locale].title;

  return (
    <footer className="border-line text-muted flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-xs">
      <span>
        {t.rich("partOf", {
          site: (chunks) => (
            <a href={MAIN_SITE_URL} className={`${LINK} font-semibold`}>
              {chunks}
            </a>
          ),
        })}
      </span>
      <span className="flex gap-4 sm:ml-auto">
        <Link href="/datenschutz" className={LINK}>
          {privacyTitle}
        </Link>
        <a href={IMPRINT_URL} className={LINK}>
          {t("imprint")}
        </a>
      </span>
    </footer>
  );
}
