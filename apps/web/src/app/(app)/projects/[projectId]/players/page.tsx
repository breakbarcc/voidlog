import { Suspense } from "react";
import { ProjectRole } from "@voidlog/db";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { TableSkeleton } from "@/components/table-skeleton";
import { hasRole, requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { ROSTER_COLUMNS, RosterSection } from "./roster-section";

/**
 * Only the membership check and the heading are awaited here; the table
 * loads its data in RosterSection and streams in behind a skeleton.
 */
export default async function RosterPage(
  props: Readonly<PageProps<"/projects/[projectId]/players">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const t = await getTranslations("roster");
  const tSidebar = await getTranslations("sidebar");

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: t("breadcrumb") },
        ]}
      />
      <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted mb-6 mt-1 text-sm">{t("subtitle")}</p>

      <Suspense fallback={<TableSkeleton columns={ROSTER_COLUMNS} />}>
        <RosterSection
          projectId={projectId}
          canEdit={hasRole(membership.role, ProjectRole.CONTRIBUTOR)}
        />
      </Suspense>
    </div>
  );
}
