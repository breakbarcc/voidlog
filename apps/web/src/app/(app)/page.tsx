import { ProjectRole, prisma } from "@voidlog/db";
import { Card } from "@radix-ui/themes";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { PhaseBadge } from "@/components/phase-badge";
import { Sidebar } from "@/components/sidebar";
import type { Locale } from "@/i18n/locale";
import { isMainPhase } from "@/lib/main-phases";
import { requireSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await requireSession();
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const accountFallback = tCommon("account");
  const locale = (await getLocale()) as Locale;

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId: session.user.id } } },
    include: {
      uploadBatches: {
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          logFiles: {
            select: {
              encounterResult: {
                select: {
                  bossId: true,
                  success: true,
                  phaseResults: { select: { name: true, order: true, reached: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const summaries = projects.map((project) => {
    const encounters = project.uploadBatches
      .flatMap((b) => b.logFiles)
      .map((f) => f.encounterResult)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const successRate =
      encounters.length > 0
        ? Math.round((encounters.filter((e) => e.success).length / encounters.length) * 100)
        : null;

    let furthestPhase: { name: string; order: number; bossId: string } | null = null;
    for (const encounter of encounters) {
      for (const phase of encounter.phaseResults) {
        if (
          phase.reached &&
          isMainPhase(encounter.bossId, phase.name) &&
          (!furthestPhase || phase.order > furthestPhase.order)
        ) {
          furthestPhase = { ...phase, bossId: encounter.bossId };
        }
      }
    }

    return {
      id: project.id,
      name: project.name,
      lastBatchAt: project.uploadBatches[0]?.createdAt ?? null,
      successRate,
      furthestPhase,
    };
  });

  async function createProject(formData: FormData) {
    "use server";
    const rawName = formData.get("name");
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) return;

    const currentSession = await requireSession();
    const project = await prisma.project.create({
      data: {
        name,
        ownerId: currentSession.user.id,
        members: { create: { userId: currentSession.user.id, role: ProjectRole.OWNER } },
      },
    });
    redirect(`/projects/${project.id}`);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={session.user.name ?? accountFallback} />
      <div className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-heading text-foreground-strong text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted mt-1 text-sm">{t("subtitle")}</p>
          </div>
          <CreateProjectDialog action={createProject} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="min-w-0">
              <Card size="3" className="border-line bg-surface h-full border">
                <div className="font-heading text-foreground truncate text-base font-semibold">
                  {p.name}
                </div>
                <div className="text-muted mb-4 text-xs">
                  {t("lastUpload")}: {p.lastBatchAt ? formatDate(p.lastBatchAt, locale) : tCommon("dash")}
                </div>
                <div className="flex flex-col gap-3.5">
                  <div>
                    <div className="text-muted mb-1 text-[11px] font-medium uppercase tracking-wide">
                      {t("successRate")}
                    </div>
                    <div className="font-heading text-warning text-xl font-bold">
                      {p.successRate === null ? tCommon("dash") : `${p.successRate}%`}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted mb-1 text-[11px] font-medium uppercase tracking-wide">
                      {t("furthestPhase")}
                    </div>
                    {p.furthestPhase ? (
                      <PhaseBadge
                        bossId={p.furthestPhase.bossId}
                        name={p.furthestPhase.name}
                        order={p.furthestPhase.order}
                      />
                    ) : (
                      <span className="text-muted text-sm">{tCommon("dash")}</span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {summaries.length === 0 ? (
            <p className="text-muted col-span-full">{t("empty")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
