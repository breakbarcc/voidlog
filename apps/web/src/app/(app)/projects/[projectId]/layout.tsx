import { ProjectRole } from "@voidlog/db";
import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import { hasRole, requireProjectViewer } from "@/lib/projects";

// Project pages can be opened without an account through the share link, so keep
// them out of search indexes and don't leak the URL as a referrer.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

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
