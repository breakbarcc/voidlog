import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE_NAME, type Locale } from "./locale";

async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  // No stored preference yet — a clear German browser preference gets German,
  // anything else (including no header at all) falls back to English.
  const acceptLanguage = (await headers()).get("accept-language");
  if (acceptLanguage?.toLowerCase().startsWith("de")) return "de";

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
