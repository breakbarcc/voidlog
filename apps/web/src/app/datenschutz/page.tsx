import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/i18n/locale";
import { PRIVACY } from "@/lib/legal/privacy";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  return {
    title: `${PRIVACY[locale].title} | voidlog`,
    robots: { index: true, follow: true },
  };
}

/**
 * Public privacy policy — reachable without signing in (excluded from the
 * auth proxy's matcher in `proxy.ts`), linked from the login page.
 */
export default async function PrivacyPage() {
  const locale = (await getLocale()) as Locale;
  const content = PRIVACY[locale];

  return (
    <div className="void-gradient-bg flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-6 sm:px-12">
        <Link href="/login" className="flex items-center gap-3">
          <span className="bg-primary h-[22px] w-[22px] [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]" />
          <span className="font-heading text-foreground-strong text-lg font-bold tracking-wide">
            VOIDLOG
          </span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
        <h1 className="font-heading text-foreground-strong mb-3 text-3xl font-bold">
          {content.title}
        </h1>
        <p className="text-muted-strong mb-2 text-sm leading-relaxed">{content.intro}</p>
        <p className="text-muted mb-10 text-xs">{content.updated}</p>

        <div className="flex flex-col gap-8">
          {content.sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-foreground-strong text-base font-semibold">{section.title}</h2>
              {section.paragraphs?.map((p) => (
                <p key={p} className="text-muted-strong text-sm leading-relaxed">
                  {p}
                </p>
              ))}
              {section.list ? (
                <ul className="text-muted-strong list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="border-line mt-12 border-t pt-6">
          <Link href="/login" className="text-primary text-sm hover:underline">
            ← {content.back}
          </Link>
        </div>
      </main>
    </div>
  );
}
