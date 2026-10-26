import { Table } from "@radix-ui/themes";
import { getTranslations } from "next-intl/server";
import { TOP_FAILED_MECHANICS, type FailedMechanic } from "@/lib/failed-mechanics";

/**
 * Top fails of one player (`scope="player"`) or the whole squad
 * (`scope="project"`), see lib/failed-mechanics.ts. `attempts` is the number
 * of attempts the counts are taken over.
 */
export async function FailedMechanicsTable({
  mechanics,
  attempts,
  scope,
}: Readonly<{ mechanics: FailedMechanic[]; attempts: number; scope: "player" | "project" }>) {
  const t = await getTranslations("failedMechanics");
  return (
    <>
      <h2 className="text-muted-strong mb-1 text-xs font-medium uppercase tracking-wide">
        {t("title", { count: TOP_FAILED_MECHANICS })}
      </h2>
      <p className="text-muted mb-3.5 text-xs">{t(`${scope}.hint`)}</p>
      <Table.Root variant="surface" className="border-line bg-surface border">
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
                {t("empty")}
              </Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
    </>
  );
}
