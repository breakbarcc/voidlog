import { Suspense } from "react";
import { ProjectRole, prisma } from "@voidlog/db";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { hasRole, requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { DeleteProjectButton } from "../delete-project-button";
import { HistorySection } from "./history-section";
import { HistorySkeleton } from "./history-skeleton";

export default async function ProjectDetailPage(
  props: Readonly<PageProps<"/projects/[projectId]">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("project");
  const tSidebar = await getTranslations("sidebar");

  // Just the count for the heading; the chart and the table load in
  // HistorySection and stream in behind a skeleton.
  const batchCount = await prisma.uploadBatch.count({ where: { projectId } });

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[{ label: tSidebar("projects"), href: "/" }, { label: membership.project.name }]}
      />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-heading text-foreground-strong text-2xl font-bold">
            {membership.project.name}
          </h1>
          <p className="text-muted mt-1 text-sm">{t("raidNightsTracked", { count: batchCount })}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasRole(membership.role, ProjectRole.CONTRIBUTOR) ? (
            <Link
              href={`/projects/${projectId}/batches/new`}
              className="bg-primary text-primary-foreground inline-flex h-8 items-center justify-center rounded-sm px-3.5 text-sm font-semibold"
            >
              {t("uploadBatch")}
            </Link>
          ) : null}
          {membership.role === ProjectRole.ADMIN ? (
            <DeleteProjectButton projectId={projectId} projectName={membership.project.name} />
          ) : null}
        </div>
      </div>

      <Suspense fallback={<HistorySkeleton />}>
        <HistorySection projectId={projectId} locale={locale} />
      </Suspense>
    </div>
  );
}
