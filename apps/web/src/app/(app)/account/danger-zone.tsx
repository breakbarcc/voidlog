"use client";

import { AlertDialog, Button } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

type Action = "logs" | "account";

function DangerRow({
  title,
  description,
  buttonLabel,
  confirmTitle,
  confirmDescription,
  pending,
  onConfirm,
}: Readonly<{
  title: string;
  description: string;
  buttonLabel: string;
  confirmTitle: string;
  confirmDescription: string;
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

export function DangerZone({ logCount }: Readonly<{ logCount: number }>) {
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
          confirmDescription={t("logsConfirm", { count: logCount })}
          pending={pending === "logs"}
          onConfirm={() => run("logs")}
        />
        <DangerRow
          title={t("accountTitle")}
          description={t("accountDescription")}
          buttonLabel={t("accountButton")}
          confirmTitle={t("accountConfirmTitle")}
          confirmDescription={t("accountConfirm")}
          pending={pending === "account"}
          onConfirm={() => run("account")}
        />
      </div>
      {error ? <p className="text-danger px-5 pb-4 text-sm">{error}</p> : null}
    </section>
  );
}
