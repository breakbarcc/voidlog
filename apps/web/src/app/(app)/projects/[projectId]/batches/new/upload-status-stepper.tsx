"use client";

import { CheckIcon, ClockIcon, Cross2Icon, UpdateIcon } from "@radix-ui/react-icons";
import { Tooltip } from "@radix-ui/themes";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

export type LogFileStatus = "PENDING" | "PARSING" | "DONE" | "FAILED";

type StepState = "idle" | "active" | "complete" | "failed";

const STEPS: {
  key: "pending" | "parsing" | "done";
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { key: "pending", Icon: ClockIcon },
  { key: "parsing", Icon: UpdateIcon },
  { key: "done", Icon: CheckIcon },
];

/** Index of the step a file is currently at; DONE is past the last step. */
const CURRENT_STEP: Record<LogFileStatus, number> = {
  PENDING: 0,
  PARSING: 1,
  FAILED: 1,
  DONE: STEPS.length,
};

const STEP_CLASS: Record<StepState, string> = {
  idle: "border-line text-muted",
  active: "border-warning bg-warning/15 text-warning",
  complete: "border-success bg-success/15 text-success",
  failed: "border-danger bg-danger/15 text-danger",
};

function stepState(index: number, status: LogFileStatus): StepState {
  const current = CURRENT_STEP[status];
  if (index < current) return "complete";
  if (index > current) return "idle";
  return status === "FAILED" ? "failed" : "active";
}

/**
 * Pending → processing → done as icons joined by lines: grey until reached,
 * yellow while active, green once finished — so a file's progress fills up
 * from left to right like a progress bar. A failed file stops red at the
 * processing step.
 */
export function UploadStatusStepper({
  status,
  errorMessage,
}: Readonly<{ status: LogFileStatus; errorMessage: string | null }>) {
  const t = useTranslations("batchUploadForm.steps");

  return (
    <div className="flex items-center justify-end" aria-label={t(status)}>
      {STEPS.map(({ key, Icon }, index) => {
        const state = stepState(index, status);
        const failed = state === "failed";
        const label = failed ? t("FAILED") : t(key);
        const tooltip = failed && errorMessage ? `${label}: ${errorMessage}` : label;
        const StepIcon = failed ? Cross2Icon : Icon;

        return (
          <div key={key} className="flex items-center">
            {index > 0 ? (
              <span className="bg-line relative h-0.5 w-8 overflow-hidden rounded-full">
                <span
                  className="bg-success absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
                  style={{ width: stepState(index - 1, status) === "complete" ? "100%" : "0%" }}
                />
              </span>
            ) : null}
            <Tooltip content={tooltip}>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-500 ${STEP_CLASS[state]}`}
              >
                <StepIcon
                  className={`h-3.5 w-3.5 ${
                    state === "active" && key === "parsing" ? "animate-spin" : ""
                  } ${state === "active" && key === "pending" ? "animate-pulse" : ""}`}
                />
              </span>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
