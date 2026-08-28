"use client";

import { Button } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function DeleteProjectButton({
  projectId,
  projectName,
}: Readonly<{
  projectId: string;
  projectName: string;
}>) {
  const router = useRouter();
  const t = useTranslations("deleteProject");
  const tCommon = useTranslations("common");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(t("confirm", { name: projectName }))) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Could not delete project (${response.status})`);
      }
      router.push("/");
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
