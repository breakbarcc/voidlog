import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { safeRedirectPath } from "@/lib/redirect";
import { SignInButton } from "./sign-in-button";

type Feature = { title: string; text: string };

// Dot color per feature tile, in the order of the `login.features` messages.
const FEATURE_COLORS = ["#4fb3d9", "#e8643a", "#4caf50", "#3dbfa6"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/login" },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      type: "website",
      siteName: "voidlog",
    },
  };
}

export default async function LoginPage(props: Readonly<PageProps<"/login">>) {
  // The proxy sends unauthenticated visitors here with the page they wanted
  // (e.g. an invite link) as `callbackUrl`, so they land there after signing in.
  const redirectTo = safeRedirectPath((await props.searchParams).callbackUrl);
  const session = await auth();
  if (session?.user) {
    redirect(redirectTo);
  }
  const t = await getTranslations("login");
  const features = t.raw("features") as Feature[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "voidlog",
    description: t("metaDescription"),
    applicationCategory: "GameApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };

  return (
    <div className="void-gradient-bg relative flex min-h-screen flex-col overflow-hidden">
      <div className="void-orb bg-primary/25 -top-30 -left-25 absolute h-[480px] w-[480px]" />
      <div className="void-orb bg-success/15 -bottom-35 absolute -right-20 h-[420px] w-[420px] [animation-duration:8s]" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12">
        <div className="flex items-center gap-3">
          <span className="bg-primary h-[22px] w-[22px] [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]" />
          <span className="font-heading text-foreground-strong text-lg font-bold tracking-wide">
            VOIDLOG
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted hidden text-xs tracking-wide sm:block">{t("topbar")}</span>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 lg:grid-cols-[1fr_420px] lg:gap-20">
        <div className="order-2 flex flex-col gap-8 lg:order-1">
          <div className="flex flex-col gap-5">
            <h1 className="font-heading text-foreground-strong text-3xl font-bold leading-tight sm:text-4xl">
              {t("headline")}
            </h1>
            <p className="text-muted-strong max-w-xl text-base leading-relaxed">{t("tagline")}</p>
          </div>

          <section aria-labelledby="features-title" className="flex flex-col gap-4">
            <h2
              id="features-title"
              className="text-muted text-xs font-medium uppercase tracking-widest"
            >
              {t("featuresTitle")}
            </h2>
            <ul className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
              {features.map((feature, i) => (
                <li key={feature.title} className="border-line border-t py-5">
                  <h3 className="text-foreground-strong mb-2 flex items-center gap-2 text-sm font-semibold">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]"
                      style={{ backgroundColor: FEATURE_COLORS[i % FEATURE_COLORS.length] }}
                    />
                    {feature.title}
                  </h3>
                  <p className="text-muted-strong text-sm leading-relaxed">{feature.text}</p>
                </li>
              ))}
            </ul>
            <p className="text-muted text-xs leading-relaxed">{t("bossNote")}</p>
          </section>
        </div>

        <div className="border-line bg-surface/90 relative order-1 w-full justify-self-center overflow-hidden rounded-md border backdrop-blur-sm lg:order-2 lg:max-w-[420px]">
          <div
            aria-hidden="true"
            className="h-[2px] w-full"
            style={{
              background:
                "linear-gradient(90deg,#4fb3d9 0 16.6%,#e8643a 16.6% 33.3%,#a98fdb 33.3% 50%,#4caf50 50% 66.6%,#8b2fd1 66.6% 83.3%,#3dbfa6 83.3% 100%)",
            }}
          />
          <div className="flex flex-col gap-6 p-8">
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-foreground-strong text-2xl font-bold">
                {t("cardTitle")}
              </h2>
              <p className="text-muted-strong text-sm leading-snug">{t("cardText")}</p>
            </div>

            <div className="[&>button]:w-full [&>button]:justify-center">
              <SignInButton redirectTo={redirectTo} />
            </div>

            <section
              aria-labelledby="why-discord-title"
              className="border-line flex flex-col gap-2 border-t pt-6"
            >
              <h2 id="why-discord-title" className="text-foreground-strong text-xs font-semibold">
                {t("whyDiscordTitle")}
              </h2>
              <p className="text-muted text-xs leading-relaxed">{t("whyDiscord")}</p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
