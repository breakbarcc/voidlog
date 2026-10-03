"use client";

import { Badge, Button, Select, TextField } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

const ROLES = ["ADMIN", "CONTRIBUTOR", "VIEWER"] as const;
const EXPIRY_DAYS = [1, 7, 30] as const;
const MAX_USES = ["unlimited", "1", "5", "10", "25"] as const;

export interface InviteRow {
  id: string;
  role: (typeof ROLES)[number];
  expires: string;
  maxUses: number | null;
  useCount: number;
  createdBy: string | null;
}

export function InvitesSection({
  projectId,
  invites,
}: Readonly<{ projectId: string; invites: InviteRow[] }>) {
  const router = useRouter();
  const t = useTranslations("members.invites");
  const tRoles = useTranslations("members.roles");
  const [role, setRole] = useState<(typeof ROLES)[number]>("VIEWER");
  const [days, setDays] = useState("7");
  const [maxUses, setMaxUses] = useState<string>("unlimited");
  const [pending, setPending] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          expiresInDays: Number(days),
          maxUses: maxUses === "unlimited" ? null : Number(maxUses),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error === "too_many_invites"
            ? t("errorTooMany")
            : t("errorGeneric", { status: response.status }),
        );
      }
      const { token } = await response.json();
      setLink(`${window.location.origin}/invite/${token}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setPending(false);
  }

  async function revoke(inviteId: string) {
    setRevokingId(inviteId);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(t("errorGeneric", { status: response.status }));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setRevokingId(null);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the link stays selectable in the field.
    }
  }

  return (
    <section aria-labelledby="invites-title" className="flex flex-col gap-3">
      <h2 id="invites-title" className="text-muted text-xs font-medium uppercase tracking-widest">
        {t("title")}
      </h2>
      <p className="text-muted text-sm">{t("description")}</p>

      <div className="border-line bg-surface flex flex-col gap-4 rounded-md border p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted text-xs font-medium">{t("role")}</span>
            <Select.Root value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <Select.Trigger />
              <Select.Content>
                {ROLES.map((r) => (
                  <Select.Item key={r} value={r}>
                    {tRoles(`${r}.name`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted text-xs font-medium">{t("expires")}</span>
            <Select.Root value={days} onValueChange={setDays}>
              <Select.Trigger />
              <Select.Content>
                {EXPIRY_DAYS.map((d) => (
                  <Select.Item key={d} value={String(d)}>
                    {t("days", { count: d })}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted text-xs font-medium">{t("maxUses")}</span>
            <Select.Root value={maxUses} onValueChange={setMaxUses}>
              <Select.Trigger />
              <Select.Content>
                {MAX_USES.map((m) => (
                  <Select.Item key={m} value={m}>
                    {m === "unlimited" ? t("unlimited") : m}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <Button type="button" onClick={create} disabled={pending}>
            {pending ? t("creating") : t("create")}
          </Button>
        </div>
        {role === "ADMIN" ? <p className="text-warning text-xs">{t("adminWarning")}</p> : null}

        {link ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TextField.Root
                readOnly
                value={link}
                aria-label={t("linkLabel")}
                className="flex-1"
                onFocus={(e) => e.target.select()}
              />
              <Button type="button" variant="soft" onClick={copy}>
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <p className="text-muted text-xs">{t("linkOnce")}</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <div className="border-line bg-surface divide-line-soft divide-y rounded-md border">
        {invites.length === 0 ? (
          <p className="text-muted px-5 py-4 text-sm">{t("empty")}</p>
        ) : (
          invites.map((invite) => (
            <div key={invite.id} className="flex items-center gap-4 px-5 py-3">
              <Badge color={invite.role === "ADMIN" ? "red" : "gray"}>
                {tRoles(`${invite.role}.name`)}
              </Badge>
              <div className="text-muted min-w-0 flex-1 text-xs">
                <div>{t("validUntil", { date: invite.expires })}</div>
                <div>
                  {invite.maxUses === null
                    ? t("usesUnlimited", { used: invite.useCount })
                    : t("uses", { used: invite.useCount, max: invite.maxUses })}
                  {invite.createdBy ? ` · ${t("createdBy", { name: invite.createdBy })}` : ""}
                </div>
              </div>
              <Button
                type="button"
                color="red"
                variant="soft"
                size="1"
                disabled={revokingId === invite.id}
                onClick={() => revoke(invite.id)}
              >
                {t("revoke")}
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
