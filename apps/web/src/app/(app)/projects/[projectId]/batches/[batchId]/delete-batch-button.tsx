"use client";

import { Button } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function DeleteBatchButton({
  projectId,
  batchId,
  batchLabel,
}: Readonly<{
  projectId: string;
  batchId: string;
  batchLabel: string;
}>) {
  const router = useRouter();
  const t = useTranslations("deleteBatch");
  const tCommon = useTranslations("common");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(t("confirm", { label: batchLabel }))) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/batches/${batchId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Could not delete batch (${response.status})`);
      }
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" color="red" variant="soft" onClick={handleDelete} disabled={pending}>
        {pending ? tCommon("deleting") : t("button")}
      </Button>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
