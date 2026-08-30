import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { Theme } from "@radix-ui/themes";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra-petch",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${chakraPetch.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-full min-h-screen flex-col">
        <NextIntlClientProvider>
          <Theme
            appearance="dark"
            accentColor="purple"
            grayColor="mauve"
            radius="small"
            panelBackground="solid"
            className="flex min-h-screen flex-1 flex-col"
          >
            {children}
          </Theme>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
