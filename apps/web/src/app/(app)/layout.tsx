import type { ReactNode } from "react";

/**
 * No auth gate here: the dashboard, account and write pages call
 * `requireSession()` themselves, and project pages go through
 * `requireProjectViewer()` (a member or a visitor with the share link).
 * Doesn't render the sidebar itself — the dashboard page renders it
 * directly (no project context), and `projects/[projectId]/layout.tsx`
 * renders it with project context. Rendering it here too would nest two
 * sidebars for all project routes.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
