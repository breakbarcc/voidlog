"use client";

import { Button } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function AcceptButton({ token }: Readonly<{ token: string }>) {
  const router = useRouter();
  const t = useTranslations("invite");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const state = ["not_found", "expired", "exhausted"].includes(body?.error)
          ? body.error
          : null;
        throw new Error(
          state ? t(`invalid.${state}.text`) : t("errorGeneric", { status: response.status }),
        );
      }
      const { projectId } = await response.json();
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="3" onClick={accept} disabled={pending}>
        {pending ? t("joining") : t("join")}
      </Button>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
