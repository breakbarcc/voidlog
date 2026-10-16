import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Only the pages a visitor can open without signing in — everything else sits
 * behind the Discord login and redirects crawlers to it, so listing it would
 * just hand search engines redirects.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/datenschutz`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
