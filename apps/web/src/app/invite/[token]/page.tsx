import { prisma } from "@voidlog/db";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { hashInviteToken, inviteState } from "@/lib/invites";
import { requireSession } from "@/lib/session";
import { AcceptButton } from "./accept-button";

// Invite links are private — keep them out of search indexes.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InvitePage(props: Readonly<PageProps<"/invite/[token]">>) {
  const { token } = await props.params;
  const session = await requireSession();
  const t = await getTranslations("invite");

  const invite = await prisma.projectInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: {
      project: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (invite) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: invite.projectId, userId: session.user.id } },
      select: { id: true },
    });
    // Already a member: nothing to redeem, just go to the project.
    if (membership) {
      redirect(`/projects/${invite.projectId}`);
    }
  }

  const state = inviteState(invite);

  return (
    <div className="void-gradient-bg relative flex min-h-screen flex-col overflow-hidden">
      <div className="void-orb bg-primary/25 -top-30 -left-25 absolute h-[480px] w-[480px]" />
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12">
        <Link href="/" className="flex items-center gap-3">
          <span className="bg-primary h-[22px] w-[22px] [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]" />
          <span className="font-heading text-foreground-strong text-lg font-bold tracking-wide">
            VOIDLOG
          </span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <div className="border-line bg-surface/90 w-full max-w-[420px] overflow-hidden rounded-md border backdrop-blur-sm">
          <div className="flex flex-col gap-6 p-8">
            {invite && state === "valid" ? (
              <>
                <div className="flex flex-col gap-2">
                  <h1 className="font-heading text-foreground-strong text-2xl font-bold">
                    {t("title", { project: invite.project.name })}
                  </h1>
                  <p className="text-muted-strong text-sm leading-snug">
                    {t("text", {
                      inviter: invite.createdBy?.name ?? t("unknownInviter"),
                      role: t(`roles.${invite.role}`),
                    })}
                  </p>
                </div>
                <p className="text-muted text-xs leading-relaxed">
                  {t(`roleHints.${invite.role}`)}
                </p>
                <AcceptButton token={token} />
              </>
            ) : (
              <>
                <h1 className="font-heading text-foreground-strong text-2xl font-bold">
                  {t(`invalid.${state}.title`)}
                </h1>
                <p className="text-muted-strong text-sm leading-snug">
                  {t(`invalid.${state}.text`)}
                </p>
                <Link href="/" className="text-accent text-sm hover:underline">
                  {t("toProjects")}
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
