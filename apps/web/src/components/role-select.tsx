"use client";

import { Select } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

// Radix Select items can't have an empty value, so "no assignment" gets a sentinel.
const UNSET = "__unset";

/**
 * A player's role in a roster (lib/player-roles.ts); plain text for viewers
 * and for bosses without curated roles. Without `inheritedRole`
 * it edits the project-wide role; with it (batch roster) it edits the batch
 * override, and "unset" falls back to `inheritedRole`, the project's role.
 * Read-only text for viewers.
 */
export function RoleSelect({
  endpoint,
  account,
  role,
  roles,
  inheritedRole,
  canEdit,
}: Readonly<{
  /** PUT endpoint taking `{ account, role }`. */
  endpoint: string;
  account: string;
  /** The assignment this select edits; null when none is set. */
  role: string | null;
  roles: readonly string[];
  /** Batch roster only: the project's role, used while there is no override. */
  inheritedRole?: string | null;
  canEdit: boolean;
}>) {
  const t = useTranslations("roleSelect");
  const router = useRouter();
  const [value, setValue] = useState(role ?? UNSET);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBatch = inheritedRole !== undefined;
  const unsetLabel = isBatch
    ? t("projectDefault", { role: inheritedRole ?? t("none") })
    : t("none");

  if (!canEdit || roles.length === 0) {
    const shown = role ?? inheritedRole ?? null;
    return (
      <span className={shown ? "text-muted-strong" : "text-muted"}>
        {shown ?? t("none")}
        {isBatch && role ? (
          <span className="text-accent ml-1 text-xs">{t("overridden")}</span>
        ) : null}
      </span>
    );
  }

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, role: next === UNSET ? null : next }),
      });
      if (!response.ok) throw new Error(t("error", { status: response.status }));
      router.refresh();
    } catch (err) {
      setValue(previous);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Select.Root size="1" value={value} onValueChange={change} disabled={pending}>
        <Select.Trigger
          variant={isBatch && value !== UNSET ? "soft" : "surface"}
          title={isBatch && value !== UNSET ? t("overriddenHint") : undefined}
        />
        <Select.Content>
          <Select.Item value={UNSET}>{unsetLabel}</Select.Item>
          <Select.Separator />
          {roles.map((r) => (
            <Select.Item key={r} value={r}>
              {r}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {error ? <span className="text-danger text-xs">{error}</span> : null}
    </div>
  );
}
