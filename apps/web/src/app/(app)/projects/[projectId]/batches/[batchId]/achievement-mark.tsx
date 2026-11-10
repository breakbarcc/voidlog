"use client";

import { CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { Tooltip } from "@radix-ui/themes";
import { useTranslations } from "next-intl";
import type { AchievementOutcome } from "@/lib/achievements";

function formatFightTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A kill's stack achievements (lib/achievements.ts, e.g. Voidwalker): green
 * when the kill earned it, red when a target reached the failing stack —
 * with which one and when in the tooltip. Only for kills; a wipe earns
 * nothing either way.
 */
export function AchievementMarks({
  success,
  achievements,
}: Readonly<{ success: boolean; achievements: readonly AchievementOutcome[] }>) {
  const t = useTranslations("batchAttempts.achievements");
  if (!success || achievements.length === 0) return null;

  return (
    <span className="inline-flex gap-1">
      {achievements.map((a) => (
        <Tooltip
          key={a.name}
          content={
            a.failedBy
              ? t("failed", {
                  name: a.name,
                  target: a.failedBy.ordinal,
                  stacks: a.failedBy.stacks,
                  time: formatFightTime(a.failedBy.timeMs),
                })
              : t("earned", { name: a.name })
          }
        >
          <span
            className={`inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
              a.earned ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
            }`}
          >
            {a.earned ? <CheckIcon className="h-3 w-3" /> : <Cross2Icon className="h-3 w-3" />}
            {a.name}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
