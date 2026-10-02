import { ProjectRole } from "@voidlog/db";
import { getTranslations } from "next-intl/server";
import { Sidebar } from "@/components/sidebar";
import { hasRole, requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";

export default async function ProjectLayout(props: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const tCommon = await getTranslations("common");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userName={session.user.name ?? tCommon("account")}
        userImage={session.user.image}
        currentProject={{
          id: projectId,
          name: membership.project.name,
          canUpload: hasRole(membership.role, ProjectRole.CONTRIBUTOR),
        }}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">{props.children}</div>
    </div>
  );
}
