import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { Callout } from "@radix-ui/themes";
import { getTranslations } from "next-intl/server";
import { isDpsReportReachable } from "@/lib/dps-report-status";

/**
 * Warns before uploading while dps.report is unreachable — the uploads would
 * all fail to parse. Rendered behind its own <Suspense> (page.tsx), so the
 * check's wait never holds up the form.
 */
export async function DpsReportNotice() {
  if ((await isDpsReportReachable()) !== false) return null;
  const t = await getTranslations("batchesNew.dpsReportDown");
  return (
    <Callout.Root color="amber" variant="surface" className="mt-5">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Callout.Text>
        <span className="font-semibold">{t("title")}</span> {t("text")}
      </Callout.Text>
    </Callout.Root>
  );
}
