"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_COOKIE_NAME, locales, type Locale } from "@/i18n/locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeLocaleCookie(locale: Locale) {
  // Shared with the breakbar.cc main site — the leading dot on Domain makes
  // the cookie readable from every subdomain, not just this one. Omitted on
  // localhost/other hosts, where browsers reject a cross-domain cookie
  // Domain attribute outright.
  const isBreakbarDomain = window.location.hostname.endsWith("breakbar.cc");
  const domainAttr = isBreakbarDomain ? "; Domain=.breakbar.cc" : "";
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${domainAttr}`;
}

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("languageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: Locale) {
    if (next === locale || isPending) return;
    writeLocaleCookie(next);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("label")}>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => handleChange(option)}
          disabled={isPending}
          aria-pressed={option === locale}
          className={`rounded px-2 py-1 text-xs font-medium uppercase transition-colors ${
            option === locale
              ? "bg-primary/20 text-foreground-strong"
              : "text-muted hover:text-foreground-strong cursor-pointer"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
