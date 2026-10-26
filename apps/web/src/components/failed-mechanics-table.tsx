"use client";

import { Card, Select, Table } from "@radix-ui/themes";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { TOP_FAILED_MECHANICS, type FailedMechanicsView } from "@/lib/failed-mechanics-view";

// Radix Select items can't have an empty value, so "every role" gets a sentinel.
const ALL_ROLES = "__all";

/**
 * Top fails of one player (`scope="player"`) or the whole squad
 * (`scope="project"`), see lib/failed-mechanics.ts. With `roles`, a dropdown
 * narrows the table to the fails of the players holding one role
 * (`byRole`).
 */
export function FailedMechanicsCard({
  scope,
  all,
  byRole = {},
  roles = [],
}: Readonly<{
  scope: "player" | "project";
  all: FailedMechanicsView;
  byRole?: Record<string, FailedMechanicsView>;
  /** Roles to offer in the dropdown (lib/player-roles.ts); none = no dropdown. */
  roles?: readonly string[];
}>) {
  const t = useTranslations("failedMechanics");
  const [role, setRole] = useState(ALL_ROLES);
  const view = role === ALL_ROLES ? all : (byRole[role] ?? { mechanics: [], attempts: 0 });
  const { mechanics, attempts } = view;

  return (
    <Card size="3" className="border-line bg-surface border">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-muted-strong text-xs font-medium uppercase tracking-wide">
          {t("title", { count: TOP_FAILED_MECHANICS })}
        </div>
        {roles.length > 0 ? (
          <Select.Root size="1" value={role} onValueChange={setRole}>
            <Select.Trigger aria-label={t("roleFilter")} />
            <Select.Content>
              <Select.Item value={ALL_ROLES}>{t("allRoles")}</Select.Item>
              <Select.Separator />
              {roles.map((r) => (
                <Select.Item key={r} value={r}>
                  {r}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        ) : null}
      </div>
      <p className="text-muted mb-3.5 text-xs">
        {t(`${scope}.hint`)}
        {role === ALL_ROLES ? null : ` ${t("roleHint", { role })}`}
      </p>
      <Table.Root variant="ghost">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>#</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("mechanic")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("count")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("perAttempt")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell title={t(`${scope}.attemptsHint`)}>
              {t("attempts")}
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {mechanics.map((m, i) => (
            <Table.Row key={`${m.bossId}:${m.mechanicName}`}>
              <Table.Cell className="text-muted">{i + 1}</Table.Cell>
              <Table.Cell>
                <div className="text-foreground font-semibold">{m.displayName}</div>
                <div className="text-muted text-xs">{m.mechanicName}</div>
              </Table.Cell>
              <Table.Cell className="text-warning font-semibold">{m.count}</Table.Cell>
              <Table.Cell className="text-muted-strong">
                {(m.count / attempts).toFixed(2)}
              </Table.Cell>
              <Table.Cell className="text-warning font-semibold">
                {Math.round((m.attempts / attempts) * 100)}%{" "}
                <span className="text-muted text-sm font-medium">
                  ({m.attempts}/{attempts})
                </span>
              </Table.Cell>
            </Table.Row>
          ))}
          {mechanics.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={5} className="text-muted">
                {role === ALL_ROLES ? t("empty") : t("emptyRole", { role })}
              </Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
    </Card>
  );
}
