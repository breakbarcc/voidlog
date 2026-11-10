"use client";

import { Button, Table, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { UploadStatusStepper, type LogFileStatus } from "./upload-status-stepper";

interface CreateBatchResponse {
  batchId: string;
  files: { logFileId: string; storageKey: string; uploadUrl: string }[];
}

interface LogFileSnapshot {
  id: string;
  status: LogFileStatus;
  errorMessage: string | null;
  /** Set once dps.report accepted the upload — tells a failed upload from a failed processing. */
  externalReportUrl: string | null;
}

interface BatchSnapshot {
  total: number;
  done: number;
  failed: number;
  files: LogFileSnapshot[];
}

type Phase = "idle" | "uploading" | "processing" | "cancelling" | "complete" | "error";

/** One upload attempt: aborts its in-flight requests and remembers its batch once created. */
interface UploadRun {
  controller: AbortController;
  batchId: string | null;
}

function isLogFile(file: File): boolean {
  return /\.(evtc|zevtc)$/i.test(file.name);
}

export function BatchUploadForm({ projectId }: Readonly<{ projectId: string }>) {
  const t = useTranslations("batchUploadForm");
  const [label, setLabel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BatchSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const runRef = useRef<UploadRun | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list).filter(isLogFile));
  }

  async function deleteBatch(id: string) {
    const response = await fetch(`/api/batches/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(t("errorCancel", { status: response.status }));
    }
  }

  async function handleCancel() {
    const run = runRef.current;
    if (!run || !window.confirm(t("cancelConfirm"))) return;
    run.controller.abort();
    eventSourceRef.current?.close();
    setPhase("cancelling");
    try {
      // Without a batch id the create request is still in flight —
      // handleSubmit deletes the batch itself once it arrives.
      if (run.batchId) await deleteBatch(run.batchId);
      runRef.current = null;
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setBatchId(null);
      setSnapshot(null);
      setError(null);
      setNotice(t("cancelled"));
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setError(null);
    setNotice(null);
    setPhase("uploading");
    const run: UploadRun = { controller: new AbortController(), batchId: null };
    runRef.current = run;
    const { signal } = run.controller;

    function fail(message: string) {
      setError(message);
      setPhase("error");
    }

    try {
      const createResponse = await fetch(`/api/projects/${projectId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          files: files.map((f) => ({ fileName: f.name })),
        }),
      });
      if (!createResponse.ok) {
        fail(t("errorCreateBatch", { status: createResponse.status }));
        return;
      }
      const created = (await createResponse.json()) as CreateBatchResponse;
      if (signal.aborted) {
        // Cancelled while the batch was being created.
        await deleteBatch(created.batchId).catch(() => undefined);
        return;
      }
      run.batchId = created.batchId;
      setBatchId(created.batchId);

      // Direct-to-storage upload (ADR-003) — files never pass through our server.
      await Promise.all(
        created.files.map((entry, i) =>
          fetch(entry.uploadUrl, {
            method: "PUT",
            body: files[i],
            headers: { "Content-Type": "application/octet-stream" },
            signal,
          }).then((res) => {
            if (!res.ok)
              throw new Error(
                t("errorUploadFile", { fileName: files[i]?.name ?? "", status: res.status }),
              );
          }),
        ),
      );

      setPhase("processing");

      const enqueueResponse = await fetch(`/api/batches/${created.batchId}/enqueue`, {
        method: "POST",
        signal,
      });
      if (!enqueueResponse.ok) {
        fail(t("errorEnqueue", { status: enqueueResponse.status }));
        return;
      }

      const source = new EventSource(`/api/batches/${created.batchId}/events`);
      eventSourceRef.current = source;
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data) as BatchSnapshot | { event: "complete" };
        if ("event" in payload) {
          setPhase("complete");
          source.close();
          return;
        }
        setSnapshot(payload);
      };
      source.onerror = () => {
        source.close();
      };
    } catch (err) {
      // A cancel aborts the requests on purpose — handleCancel takes over.
      if (signal.aborted) return;
      // Network errors, and a file upload rejected by the storage (thrown above).
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField.Root
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("labelPlaceholder")}
          disabled={phase !== "idle"}
        />

        <button
          type="button"
          onClick={() => phase === "idle" && fileInputRef.current?.click()}
          disabled={phase !== "idle"}
          onDragOver={(e) => {
            e.preventDefault();
            if (phase === "idle") setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (phase === "idle") addFiles(e.dataTransfer.files);
          }}
          className={`w-full rounded-lg border-2 border-dashed px-8 py-10 text-center ${
            phase === "idle" ? "cursor-pointer" : "cursor-not-allowed opacity-60"
          } ${dragOver ? "border-primary bg-primary/5" : "border-line-soft"}`}
        >
          <span className="bg-primary mx-auto mb-3.5 block h-10 w-10 opacity-85 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]" />
          <div className="text-foreground mb-1.5 text-sm font-semibold">
            {files.length > 0 ? t("filesSelected", { count: files.length }) : t("dropFiles")}
          </div>
          <div className="text-muted text-xs">{t("dropHint")}</div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".evtc,.zevtc"
          disabled={phase !== "idle"}
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="3" disabled={files.length === 0 || phase !== "idle"}>
            {phase === "idle" ? t("uploadButton", { count: files.length || 0 }) : t("processing")}
          </Button>
          {phase === "uploading" || phase === "processing" || phase === "cancelling" ? (
            <Button
              type="button"
              size="3"
              color="red"
              variant="soft"
              onClick={handleCancel}
              disabled={phase === "cancelling"}
            >
              {phase === "cancelling" ? t("cancelling") : t("cancelButton")}
            </Button>
          ) : null}
        </div>
      </form>

      {error ? <p className="text-danger mt-4">{error}</p> : null}
      {notice ? <p className="text-muted mt-4">{notice}</p> : null}

      {phase === "uploading" ? <p className="text-muted mt-4">{t("uploading")}</p> : null}

      {phase === "processing" || phase === "cancelling" || phase === "complete" ? (
        <div className="mt-6">
          <h2 className="text-muted-strong text-sm font-semibold">{t("progressTitle")}</h2>
          {snapshot ? (
            <>
              <p className="text-muted mt-1 text-sm">
                {t("progressStatus", {
                  done: snapshot.done + snapshot.failed,
                  total: snapshot.total,
                })}
                {snapshot.failed > 0 ? t("progressFailed", { count: snapshot.failed }) : ""}
              </p>
              <Table.Root variant="surface" className="border-line bg-surface mt-2 border">
                <Table.Body>
                  {snapshot.files.map((f) => (
                    <Table.Row key={f.id}>
                      <Table.Cell className="text-foreground align-middle font-mono text-xs">
                        {f.id}
                      </Table.Cell>
                      <Table.Cell className="align-middle">
                        <UploadStatusStepper
                          status={f.status}
                          uploaded={f.externalReportUrl !== null}
                          errorMessage={f.errorMessage}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </>
          ) : (
            <p className="text-muted mt-1 text-sm">{t("waitingForWorker")}</p>
          )}
        </div>
      ) : null}

      {phase === "complete" && batchId ? (
        <Link
          href={`/projects/${projectId}/batches/${batchId}`}
          className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 font-semibold"
        >
          {t("viewBatch")}
        </Link>
      ) : null}
    </div>
  );
}
