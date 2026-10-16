import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/login", "/datenschutz"],
      // Signed-in areas and endpoints: nothing there for a crawler.
      disallow: ["/api/", "/projects/", "/invite/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
