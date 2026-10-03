"use client";

import { AlertDialog, Button } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

type Action = "logs" | "account";

function DangerRow({
  title,
  description,
  buttonLabel,
  confirmTitle,
  confirmDescription,
  details,
  pending,
  onConfirm,
}: Readonly<{
  title: string;
  description: string;
  buttonLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  /** Extra content under the description, e.g. a list of affected projects. */
  details?: ReactNode;
  pending: boolean;
  onConfirm: () => void;
}>) {
  const tCommon = useTranslations("common");
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-foreground-strong text-sm font-semibold">{title}</div>
        <p className="text-muted mt-1 text-sm">{description}</p>
      </div>
      <AlertDialog.Root>
        <AlertDialog.Trigger>
          <Button type="button" color="red" variant="soft" disabled={pending} className="shrink-0">
            {pending ? tCommon("deleting") : buttonLabel}
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
          <AlertDialog.Description size="2">{confirmDescription}</AlertDialog.Description>
          {details}
          <div className="mt-4 flex justify-end gap-3">
            <AlertDialog.Cancel>
              <Button type="button" variant="soft" color="gray">
                {tCommon("cancel")}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button type="button" color="red" onClick={onConfirm}>
                {buttonLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}

export function DangerZone({
  logCount,
  logProjectCount,
  deletedProjects,
  transferredProjects,
}: Readonly<{
  logCount: number;
  logProjectCount: number;
  /** Projects that vanish with the account: the user is their only admin. */
  deletedProjects: { name: string; otherMembers: number }[];
  /** Projects that continue under another admin. */
  transferredProjects: string[];
}>) {
  const router = useRouter();
  const t = useTranslations("account.danger");
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(action === "logs" ? "/api/account/logs" : "/api/account", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(t("error", { status: response.status }));
      }
      if (action === "account") {
        await signOut({ redirectTo: "/login" });
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setPending(null);
  }

  return (
    <section className="border-danger/40 bg-surface rounded-md border">
      <h2 className="border-danger/40 text-danger border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest">
        {t("title")}
      </h2>
      <div className="divide-line divide-y px-5">
        <DangerRow
          title={t("logsTitle")}
          description={t("logsDescription")}
          buttonLabel={t("logsButton")}
          confirmTitle={t("logsConfirmTitle")}
          confirmDescription={t("logsConfirm", { count: logCount, projects: logProjectCount })}
          pending={pending === "logs"}
          onConfirm={() => run("logs")}
        />
        <DangerRow
          title={t("accountTitle")}
          description={t("accountDescription")}
          buttonLabel={t("accountButton")}
          confirmTitle={t("accountConfirmTitle")}
          confirmDescription={t("accountConfirm")}
          details={
            <div className="text-muted-strong mt-3 flex flex-col gap-3 text-sm">
              {deletedProjects.length > 0 ? (
                <div>
                  <div className="text-danger font-semibold">{t("accountDeletedProjects")}</div>
                  <ul className="mt-1 list-disc pl-5">
                    {deletedProjects.map((p) => (
                      <li key={p.name}>
                        {p.name}
                        {p.otherMembers > 0
                          ? ` (${t("accountOtherMembers", { count: p.otherMembers })})`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {transferredProjects.length > 0 ? (
                <div>
                  <div className="text-foreground-strong font-semibold">
                    {t("accountTransferredProjects")}
                  </div>
                  <ul className="mt-1 list-disc pl-5">
                    {transferredProjects.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          }
          pending={pending === "account"}
          onConfirm={() => run("account")}
        />
      </div>
      {error ? <p className="text-danger px-5 pb-4 text-sm">{error}</p> : null}
    </section>
  );
}
