"use client";

import { AlertDialog, Avatar, Badge, Button, Select } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

const ROLES = ["ADMIN", "CONTRIBUTOR", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

export interface MemberRow {
  id: string;
  name: string;
  image: string | null;
  role: Role;
  joined: string;
  isSelf: boolean;
  isOwner: boolean;
}

function ConfirmButton({
  label,
  title,
  description,
  disabled,
  onConfirm,
}: Readonly<{
  label: string;
  title: string;
  description: string;
  disabled: boolean;
  onConfirm: () => void;
}>) {
  const tCommon = useTranslations("common");
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        <Button type="button" color="red" variant="soft" size="1" disabled={disabled}>
          {label}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="440px">
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description size="2">{description}</AlertDialog.Description>
        <div className="mt-4 flex justify-end gap-3">
          <AlertDialog.Cancel>
            <Button type="button" variant="soft" color="gray">
              {tCommon("cancel")}
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button type="button" color="red" onClick={onConfirm}>
              {label}
            </Button>
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}

export function MembersList({
  projectId,
  members,
  canManage,
}: Readonly<{ projectId: string; members: MemberRow[]; canManage: boolean }>) {
  const router = useRouter();
  const t = useTranslations("members");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adminCount = members.filter((m) => m.role === "ADMIN").length;

  async function request(member: MemberRow, init: RequestInit, onDone: () => void) {
    setPendingId(member.id);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${member.id}`, init);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error === "last_admin"
            ? t("errorLastAdmin")
            : t("errorGeneric", { status: response.status }),
        );
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setPendingId(null);
  }

  function changeRole(member: MemberRow, role: string) {
    return request(
      member,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      },
      () => router.refresh(),
    );
  }

  function remove(member: MemberRow) {
    return request(member, { method: "DELETE" }, () => {
      if (member.isSelf) {
        router.push("/");
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="border-line bg-surface divide-line-soft divide-y rounded-md border">
        {members.map((member) => {
          const busy = pendingId === member.id;
          // The sole admin can neither be demoted nor removed — the server
          // enforces this too; disabling just avoids a pointless round trip.
          const isSoleAdmin = member.role === "ADMIN" && adminCount <= 1;
          return (
            <div key={member.id} className="flex items-center gap-4 px-5 py-3.5">
              <Avatar
                size="3"
                radius="full"
                src={member.image ?? undefined}
                fallback={member.name.charAt(0).toUpperCase()}
              />
              <div className="min-w-0 flex-1">
                <div className="text-foreground-strong flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{member.name}</span>
                  {member.isSelf ? <Badge color="gray">{t("you")}</Badge> : null}
                  {member.isOwner ? <Badge color="amber">{t("owner")}</Badge> : null}
                </div>
                <div className="text-muted text-xs">{t("joined", { date: member.joined })}</div>
              </div>

              {canManage ? (
                <Select.Root
                  value={member.role}
                  onValueChange={(role) => changeRole(member, role)}
                  disabled={busy || isSoleAdmin}
                >
                  <Select.Trigger />
                  <Select.Content>
                    {ROLES.map((role) => (
                      <Select.Item key={role} value={role}>
                        {t(`roles.${role}.name`)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              ) : (
                <Badge color={member.role === "ADMIN" ? "red" : "gray"} size="2">
                  {t(`roles.${member.role}.name`)}
                </Badge>
              )}

              <div className="flex w-24 justify-end">
                {member.isSelf ? (
                  <ConfirmButton
                    label={t("leave")}
                    title={t("leaveConfirmTitle")}
                    description={t("leaveConfirm")}
                    disabled={busy || isSoleAdmin}
                    onConfirm={() => remove(member)}
                  />
                ) : canManage ? (
                  <ConfirmButton
                    label={t("remove")}
                    title={t("removeConfirmTitle", { name: member.name })}
                    description={t("removeConfirm", { name: member.name })}
                    disabled={busy}
                    onConfirm={() => remove(member)}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <section aria-labelledby="roles-title" className="flex flex-col gap-2">
        <h2 id="roles-title" className="text-muted text-xs font-medium uppercase tracking-widest">
          {t("rolesTitle")}
        </h2>
        <dl className="flex flex-col gap-1.5 text-sm">
          {ROLES.map((role) => (
            <div key={role} className="flex gap-3">
              <dt className="text-foreground-strong w-32 shrink-0 font-semibold">
                {t(`roles.${role}.name`)}
              </dt>
              <dd className="text-muted">{t(`roles.${role}.description`)}</dd>
            </div>
          ))}
        </dl>
        {adminCount <= 1 ? <p className="text-muted mt-1 text-xs">{t("soleAdminNote")}</p> : null}
      </section>
    </div>
  );
}
