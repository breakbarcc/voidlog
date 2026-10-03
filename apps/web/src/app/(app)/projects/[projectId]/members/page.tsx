import { ProjectRole, prisma } from "@voidlog/db";
import { getLocale, getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import type { Locale } from "@/i18n/locale";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { MembersList, type MemberRow } from "./members-list";

const ROLE_ORDER: Record<ProjectRole, number> = {
  [ProjectRole.ADMIN]: 0,
  [ProjectRole.CONTRIBUTOR]: 1,
  [ProjectRole.VIEWER]: 2,
};

export default async function MembersPage(
  props: Readonly<PageProps<"/projects/[projectId]/members">>,
) {
  const { projectId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const t = await getTranslations("members");
  const tSidebar = await getTranslations("sidebar");
  const tCommon = await getTranslations("common");
  const locale = (await getLocale()) as Locale;

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    // Never expose e-mail addresses to other members — name and avatar only.
    include: { user: { select: { name: true, image: true } } },
  });
  members.sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    name: m.user.name ?? tCommon("account"),
    image: m.user.image,
    role: m.role,
    joined: formatDate(m.createdAt, locale),
    isSelf: m.id === membership.id,
    isOwner: m.userId === membership.project.ownerId,
  }));

  return (
    <div className="max-w-3xl px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: t("breadcrumb") },
        ]}
      />
      <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted mt-1 text-sm">{t("subtitle", { count: rows.length })}</p>

      <MembersList
        projectId={projectId}
        members={rows}
        canManage={membership.role === ProjectRole.ADMIN}
      />
    </div>
  );
}
