/**
 * The public origin of the deployed app, for the absolute URLs search engines
 * need (canonical links, sitemap, robots). Not read from `AUTH_URL`: that is
 * only set at runtime on the server, while the sitemap and metadata are
 * rendered at build time.
 */
export const SITE_URL = process.env.SITE_URL ?? "https://voidlog.breakbar.cc";
