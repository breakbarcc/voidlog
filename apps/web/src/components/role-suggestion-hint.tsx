"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RoleSuggestion } from "@/lib/role-detection";

const percent = (share: number) => Math.round(share * 100);

/**
 * The role detected for a player without one (lib/role-detection.ts), with
 * the evidence as a tooltip and, for editors, a button that assigns it.
 */
export function RoleSuggestionHint({
  endpoint,
  account,
  suggestion,
  canEdit,
}: Readonly<{
  /** PUT endpoint taking `{ account, role }`. */
  endpoint: string;
  account: string;
  suggestion: RoleSuggestion;
  canEdit: boolean;
}>) {
  const t = useTranslations("roleSuggestion");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidence = [
    t("circles", { share: percent(suggestion.circleShare), count: suggestion.circleVotes }),
    suggestion.boonShare === null
      ? t("boonsMissing")
      : t("boons", {
          share: percent(suggestion.boonShare),
          count: suggestion.boonAttempts,
        }),
    suggestion.damageFits === null
      ? null
      : t(suggestion.damageFits ? "damageFits" : "damageDiffers"),
  ]
    .filter((line) => line !== null)
    .join("\n");

  async function apply() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, role: suggestion.role }),
      });
      if (!response.ok) throw new Error(t("error", { status: response.status }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-0.5 text-xs">
      <span
        title={evidence}
        className={suggestion.certainty === "high" ? "text-accent" : "text-muted-strong"}
      >
        {t(suggestion.certainty === "high" ? "suggestedHigh" : "suggestedMedium", {
          role: suggestion.role,
        })}
        {canEdit ? (
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="text-accent ml-2 underline hover:opacity-70 disabled:opacity-50"
          >
            {t("apply")}
          </button>
        ) : null}
      </span>
      {error ? <span className="text-danger">{error}</span> : null}
    </div>
  );
}
