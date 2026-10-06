import { prisma } from "@voidlog/db";
import type { Locale } from "@/i18n/locale";
import { formatDate } from "@/lib/utils";

/**
 * Display name of a batch. A batch without a label of its own is named after
 * the day its logs were recorded — in UTC and in the viewer's date format — so
 * the name stays correct when logs are added or removed later.
 */
export function batchTitle(label: string, occurredAt: Date, locale: Locale): string {
  const own = label.trim();
  if (own) return own;
  return formatDate(occurredAt, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Display names for several batches at once: the earliest recording time of a
 * batch's logs (upload time while none is parsed yet) feeds `batchTitle`.
 */
export async function loadBatchTitles(
  batches: readonly { id: string; label: string; createdAt: Date }[],
  locale: Locale,
): Promise<Map<string, string>> {
  const unnamed = batches.filter((b) => !b.label.trim());
  const earliest = new Map<string, Date>();
  if (unnamed.length > 0) {
    const encounters = await prisma.encounterResult.findMany({
      where: { recordedAt: { not: null }, logFile: { batchId: { in: unnamed.map((b) => b.id) } } },
      select: { recordedAt: true, logFile: { select: { batchId: true } } },
    });
    for (const { recordedAt, logFile } of encounters) {
      const known = earliest.get(logFile.batchId);
      if (recordedAt && (!known || recordedAt < known)) earliest.set(logFile.batchId, recordedAt);
    }
  }
  return new Map(
    batches.map((b) => [b.id, batchTitle(b.label, earliest.get(b.id) ?? b.createdAt, locale)]),
  );
}
