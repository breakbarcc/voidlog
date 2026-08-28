"use client";

import { Button } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function RemoveLogButton({
  logFileId,
  confirmMessage,
}: Readonly<{
  logFileId: string;
  confirmMessage?: string;
}>) {
  const router = useRouter();
  const t = useTranslations("removeLog");
  const tCommon = useTranslations("common");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    if (!window.confirm(confirmMessage ?? t("defaultConfirm"))) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/log-files/${logFileId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Konnte Log nicht entfernen (${response.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="1"
        variant="soft"
        color="red"
        onClick={handleRemove}
        disabled={pending}
      >
        {pending ? tCommon("removing") : tCommon("remove")}
      </Button>
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}
