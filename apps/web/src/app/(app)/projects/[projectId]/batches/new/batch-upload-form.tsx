"use client";

import { Button, Table, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

interface CreateBatchResponse {
  batchId: string;
  files: { logFileId: string; storageKey: string; uploadUrl: string }[];
}

interface LogFileSnapshot {
  id: string;
  status: "PENDING" | "PARSING" | "DONE" | "FAILED";
  errorMessage: string | null;
}

interface BatchSnapshot {
  total: number;
  done: number;
  failed: number;
  files: LogFileSnapshot[];
}

type Phase = "idle" | "uploading" | "processing" | "complete" | "error";

const STATUS_COLOR: Record<LogFileSnapshot["status"], string> = {
  PENDING: "var(--muted)",
  PARSING: "var(--primary)",
  DONE: "var(--warning)",
  FAILED: "var(--danger)",
};

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
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list).filter(isLogFile));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setError(null);
    setPhase("uploading");

    try {
      const createResponse = await fetch(`/api/projects/${projectId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || t("defaultLabel", { date: new Date().toLocaleString() }),
          files: files.map((f) => ({ fileName: f.name })),
        }),
      });
      if (!createResponse.ok) {
        throw new Error(t("errorCreateBatch", { status: createResponse.status }));
      }
      const created = (await createResponse.json()) as CreateBatchResponse;
      setBatchId(created.batchId);

      // Direct-to-storage upload (ADR-003) — files never pass through our server.
      await Promise.all(
        created.files.map((entry, i) =>
          fetch(entry.uploadUrl, {
            method: "PUT",
            body: files[i],
            headers: { "Content-Type": "application/octet-stream" },
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
      });
      if (!enqueueResponse.ok) {
        throw new Error(t("errorEnqueue", { status: enqueueResponse.status }));
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
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
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

        <Button
          type="submit"
          size="3"
          disabled={files.length === 0 || phase !== "idle"}
          className="self-start"
        >
          {phase === "idle" ? t("uploadButton", { count: files.length || 0 }) : t("processing")}
        </Button>
      </form>

      {error ? <p className="text-danger mt-4">{error}</p> : null}

      {phase === "uploading" ? <p className="text-muted mt-4">{t("uploading")}</p> : null}

      {phase === "processing" || phase === "complete" ? (
        <div className="mt-6">
          <h2 className="text-muted-strong text-sm font-semibold">{t("progressTitle")}</h2>
          {snapshot ? (
            <>
              <p className="text-muted mt-1 text-sm">
                {t("progressStatus", { done: snapshot.done + snapshot.failed, total: snapshot.total })}
                {snapshot.failed > 0 ? t("progressFailed", { count: snapshot.failed }) : ""}
              </p>
              <Table.Root variant="surface" className="border-line bg-surface mt-2 border">
                <Table.Body>
                  {snapshot.files.map((f) => (
                    <Table.Row key={f.id}>
                      <Table.Cell className="text-foreground font-mono text-xs">{f.id}</Table.Cell>
                      <Table.Cell
                        className="text-right font-semibold"
                        style={{ color: STATUS_COLOR[f.status] }}
                      >
                        {f.status}
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
