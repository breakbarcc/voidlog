"use client";

import { CheckIcon, ClockIcon, Cross2Icon, GearIcon, UploadIcon } from "@radix-ui/react-icons";
import { Tooltip } from "@radix-ui/themes";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

export type LogFileStatus = "PENDING" | "UPLOADING" | "PARSING" | "DONE" | "FAILED";

type StepKey = "pending" | "uploading" | "parsing" | "done";
type StepState = "idle" | "active" | "complete" | "failed";

const STEPS: { key: StepKey; Icon: ComponentType<{ className?: string }>; spin?: boolean }[] = [
  { key: "pending", Icon: ClockIcon },
  { key: "uploading", Icon: UploadIcon },
  { key: "parsing", Icon: GearIcon, spin: true },
  { key: "done", Icon: CheckIcon },
];

const STEP_INDEX: Record<Exclude<LogFileStatus, "FAILED">, number> = {
  PENDING: 0,
  UPLOADING: 1,
  PARSING: 2,
  DONE: STEPS.length, // past the last step: everything complete
};

const STEP_CLASS: Record<StepState, string> = {
  idle: "border-line text-muted",
  active: "border-warning bg-warning/15 text-warning",
  complete: "border-success bg-success/15 text-success",
  failed: "border-danger bg-danger/15 text-danger",
};

/**
 * Waiting → upload to dps.report → voidlog processing → done, as icons joined
 * by lines: grey until reached, yellow while active, green once finished — a
 * file's progress fills up from left to right like a progress bar. A failed
 * file stops red at the step that failed: processing once dps.report handed
 * back a report, the upload otherwise.
 */
export function UploadStatusStepper({
  status,
  uploaded,
  errorMessage,
}: Readonly<{ status: LogFileStatus; uploaded: boolean; errorMessage: string | null }>) {
  const t = useTranslations("batchUploadForm.steps");
  const failed = status === "FAILED";
  const current = failed ? STEP_INDEX[uploaded ? "PARSING" : "UPLOADING"] : STEP_INDEX[status];

  function stepState(index: number): StepState {
    if (index < current) return "complete";
    if (index > current) return "idle";
    return failed ? "failed" : "active";
  }

  return (
    <div className="flex items-center justify-end" aria-label={t(status)}>
      {STEPS.map(({ key, Icon, spin }, index) => {
        const state = stepState(index);
        const label = state === "failed" ? `${t(key)} – ${t("FAILED")}` : t(key);
        const tooltip = state === "failed" && errorMessage ? `${label}: ${errorMessage}` : label;
        const StepIcon = state === "failed" ? Cross2Icon : Icon;
        let animation = "";
        if (state === "active") animation = spin ? "animate-spin" : "animate-pulse";

        return (
          <div key={key} className="flex items-center">
            {index > 0 ? (
              <span className="bg-line relative h-0.5 w-8 overflow-hidden rounded-full">
                <span
                  className="bg-success absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
                  style={{ width: stepState(index - 1) === "complete" ? "100%" : "0%" }}
                />
              </span>
            ) : null}
            <Tooltip content={tooltip}>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-500 ${STEP_CLASS[state]}`}
              >
                <StepIcon className={`h-3.5 w-3.5 ${animation}`} />
              </span>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
