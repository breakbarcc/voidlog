// How long the upload page waits for dps.report before calling it unreachable.
const TIMEOUT_MS = 4000;

/**
 * Whether dps.report answers at all — the worker sends every uploaded log
 * there to be parsed (worker parsers/dps-report-parser.ts), so while it is
 * down every upload fails. Null when the worker doesn't use dps.report
 * (`LOG_PARSER`, same .env as the worker), so there's nothing to check.
 *
 * Any answer below 500 counts as up: dps.report has no status endpoint, and
 * a 4xx still means its server is there. Timeouts, network errors and 5xx
 * (including Cloudflare's 52x when the origin is down) count as down.
 */
export async function isDpsReportReachable(): Promise<boolean | null> {
  const baseUrl = process.env.DPS_REPORT_BASE_URL;
  if (process.env.LOG_PARSER !== "dps-report" || !baseUrl) return null;
  try {
    const response = await fetch(baseUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}
