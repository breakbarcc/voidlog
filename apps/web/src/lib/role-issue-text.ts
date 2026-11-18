import type { BatchRoleIssues } from "./role-composition";

// Distinct deviation sets listed in the tooltip before "and N more".
const SHOWN_DEVIATIONS = 3;

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * "Rollen passen in 3 von 12 Versuchen nicht" plus one line per way they don't.
 * `t` is the translator of the "project" namespace.
 */
export function roleIssueText(t: Translate, issues: BatchRoleIssues): string {
  return [
    t("roleIssues.title", {
      mismatched: issues.mismatched,
      attempts: issues.attempts,
      expected: [
        ...Object.entries(issues.composition.counts).map(([role, count]) => `${count}× ${role}`),
        t("roleIssues.fill", { role: issues.composition.fill }),
      ].join(", "),
    }),
    ...issues.deviations.slice(0, SHOWN_DEVIATIONS).map((deviations) =>
      deviations
        .map((d) =>
          d.role === null
            ? t("roleIssues.unassigned", { count: d.actual })
            : t("roleIssues.deviation", {
                role: d.role,
                actual: d.actual,
                expected: d.expected,
              }),
        )
        .join(", "),
    ),
    ...(issues.deviations.length > SHOWN_DEVIATIONS
      ? [t("roleIssues.more", { count: issues.deviations.length - SHOWN_DEVIATIONS })]
      : []),
  ].join("\n");
}
