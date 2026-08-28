import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { BatchUploadForm } from "./batch-upload-form";

export default async function NewBatchPage(
  props: Readonly<PageProps<"/projects/[projectId]/batches/new">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const t = await getTranslations("batchesNew");
  const tSidebar = await getTranslations("sidebar");

  return (
    <div className="max-w-2xl px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: t("breadcrumb") },
        ]}
      />
      <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted mt-1 text-sm">{t("description")}</p>

      <BatchUploadForm projectId={projectId} />
    </div>
  );
}
