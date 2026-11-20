import { ProjectRole } from "@voidlog/db";
import { Sidebar } from "@/components/sidebar";
import { hasRole, requireProjectViewer } from "@/lib/projects";

export default async function ProjectLayout(props: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await props.params;
  // Members, and visitors with the project's share link (lib/share-links.ts).
  const { role, project, session } = await requireProjectViewer(projectId);
  const user = session?.user;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        // No name for a visitor without a session: the sidebar shows a login instead.
        userName={user ? (user.name ?? "") : null}
        userImage={user?.image}
        currentProject={{
          id: projectId,
          name: project.name,
          canUpload: hasRole(role, ProjectRole.CONTRIBUTOR),
        }}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">{props.children}</div>
    </div>
  );
}
