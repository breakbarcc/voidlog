"use client";

import { Pencil1Icon } from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function BatchLabelEditor({
  batchId,
  label,
}: Readonly<{ batchId: string; label: string }>) {
  const router = useRouter();
  const t = useTranslations("batchLabelEditor");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setValue(label);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === label) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      if (!response.ok) {
        throw new Error(t("errorRename", { status: response.status }));
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="font-heading text-foreground-strong text-2xl font-bold">{label}</h1>
        <button
          type="button"
          onClick={startEditing}
          title={t("rename")}
          className="text-muted hover:text-foreground"
        >
          <Pencil1Icon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <TextField.Root
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          autoFocus
          className="min-w-[280px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
        />
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
        <Button type="button" variant="soft" color="gray" onClick={cancel} disabled={pending}>
          {tCommon("cancel")}
        </Button>
      </div>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
