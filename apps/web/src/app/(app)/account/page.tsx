import { ProjectRole, prisma } from "@voidlog/db";
import { Avatar } from "@radix-ui/themes";
import { getLocale, getTranslations } from "next-intl/server";
import { Sidebar } from "@/components/sidebar";
import type { Locale } from "@/i18n/locale";
import { planAccountDeletion } from "@/lib/account";
import { requireSession } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils";
import { DangerZone } from "./danger-zone";

export default async function AccountPage() {
  const session = await requireSession();
  const userId = session.user.id;
  const t = await getTranslations("account");
  const tCommon = await getTranslations("common");
  const locale = (await getLocale()) as Locale;

  const [user, projectCount, adminCount, logCount, parsedCount, logProjectCount, plan] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, email: true, image: true, createdAt: true },
      }),
      prisma.projectMember.count({ where: { userId } }),
      prisma.projectMember.count({ where: { userId, role: ProjectRole.ADMIN } }),
      prisma.logFile.count({ where: { uploadedById: userId } }),
      prisma.encounterResult.count({ where: { logFile: { uploadedById: userId } } }),
      prisma.project.count({
        where: { uploadBatches: { some: { logFiles: { some: { uploadedById: userId } } } } },
      }),
      planAccountDeletion(prisma, userId),
    ]);

  const displayName = user.name ?? tCommon("account");
  const stats = [
    { label: t("stats.logs"), value: formatNumber(logCount, locale) },
    { label: t("stats.parsed"), value: formatNumber(parsedCount, locale) },
    { label: t("stats.projects"), value: formatNumber(projectCount, locale) },
    { label: t("stats.adminProjects"), value: formatNumber(adminCount, locale) },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={displayName} userImage={user.image} />
      <div className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>

          <section className="border-line bg-surface flex items-center gap-5 rounded-md border p-6">
            <Avatar
              size="6"
              radius="full"
              src={user.image ?? undefined}
              fallback={displayName.charAt(0).toUpperCase()}
            />
            <div className="min-w-0">
              <div className="font-heading text-foreground-strong truncate text-xl font-bold">
                {displayName}
              </div>
              {user.email ? (
                <div className="text-muted-strong truncate text-sm">{user.email}</div>
              ) : null}
              <div className="text-muted mt-1 text-xs">
                {t("memberSince", { date: formatDate(user.createdAt, locale) })} · {t("via")}
              </div>
            </div>
          </section>

          <section aria-labelledby="stats-title" className="flex flex-col gap-3">
            <h2
              id="stats-title"
              className="text-muted text-xs font-medium uppercase tracking-widest"
            >
              {t("stats.title")}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="border-line bg-surface rounded-md border p-4">
                  <div className="text-muted mb-1 text-[11px] font-medium uppercase tracking-wide">
                    {s.label}
                  </div>
                  <div className="font-heading text-foreground-strong text-2xl font-bold">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-muted text-xs">{t("stats.note")}</p>
          </section>

          <DangerZone
            logCount={logCount}
            logProjectCount={logProjectCount}
            deletedProjects={plan.deleted.map((p) => ({
              name: p.name,
              otherMembers: p.otherMembers,
            }))}
            transferredProjects={plan.transferred.map((p) => p.name)}
          />
        </div>
      </div>
    </div>
  );
}
