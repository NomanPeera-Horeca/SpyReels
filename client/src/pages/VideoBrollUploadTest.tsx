/**
 * THROWAWAY / DEV ONLY
 * Minimal Phase 2 test UI: upload video to R2, confirm, poll transcription.
 * Remove once real video B-roll UI ships. Do not link from nav or marketing.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import type { VideoBrollTranscript } from "@shared/videoBroll";

type Phase =
  | "idle"
  | "creating"
  | "uploading"
  | "confirming"
  | "polling"
  | "done"
  | "error";

const POLL_MS = 2000;

export default function VideoBrollUploadTest() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [id, setId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<VideoBrollTranscript | null>(
    null
  );
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const createUpload = trpc.videoBroll.createUpload.useMutation();
  const confirmUpload = trpc.videoBroll.confirmUpload.useMutation();
  const getQuery = trpc.videoBroll.get.useQuery(
    { id: id! },
    {
      enabled: id != null && phase === "polling",
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        if (s === "analyzing" || s === "completed" || s === "failed") {
          return false;
        }
        return POLL_MS;
      },
    }
  );

  useEffect(() => {
    const data = getQuery.data;
    if (!data || phase !== "polling") return;
    setStatusLabel(data.status);
    if (data.status === "failed") {
      setLocalError(data.errorMessage || "Transcription failed");
      setPhase("error");
      return;
    }
    if (data.status === "analyzing" || data.status === "completed") {
      setTranscript(data.transcript);
      setDurationSeconds(data.durationSeconds);
      setPhase("done");
    }
  }, [getQuery.data, phase]);

  const reset = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setPhase("idle");
    setProgress(0);
    setId(null);
    setLocalError(null);
    setTranscript(null);
    setStatusLabel(null);
    setDurationSeconds(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    setLocalError(null);
    setTranscript(null);
    setProgress(0);

    const lower = file.name.toLowerCase();
    let contentType = file.type;
    if (!contentType) {
      if (lower.endsWith(".mov")) contentType = "video/quicktime";
      else if (lower.endsWith(".webm")) contentType = "video/webm";
      else contentType = "video/mp4";
    }

    try {
      setPhase("creating");
      const created = await createUpload.mutateAsync({
        filename: file.name,
        contentType,
        contentLength: file.size,
      });
      setId(created.id);

      setPhase("uploading");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("PUT", created.uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100);
            resolve();
          } else {
            reject(new Error(`Upload failed with HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.send(file);
      });
      xhrRef.current = null;

      setPhase("confirming");
      await confirmUpload.mutateAsync({ id: created.id });
      setStatusLabel("uploading");
      setPhase("polling");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      setPhase("error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
        THROWAWAY DEV PAGE (Phase 2). Upload a talking-head video, wait for
        transcription. Not a product surface.
      </p>

      <h1 className="text-xl font-semibold text-foreground">
        Video B-roll upload test
      </h1>
      <p className="text-sm text-muted-foreground">
        MP4 / MOV / WebM, max 200MB. Status flow: pending → uploading →
        transcribing → analyzing.
      </p>

      <div className="space-y-3 rounded-lg border p-4">
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
          onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Phase: <span className="text-foreground">{phase}</span>
          </span>
          {id != null ? (
            <span className="text-muted-foreground">
              id: <span className="text-foreground">{id}</span>
            </span>
          ) : null}
          {statusLabel ? (
            <span className="text-muted-foreground">
              status: <span className="text-foreground">{statusLabel}</span>
            </span>
          ) : null}
          {durationSeconds != null ? (
            <span className="text-muted-foreground">
              duration:{" "}
              <span className="text-foreground">{durationSeconds}s</span>
            </span>
          ) : null}
        </div>

        {(phase === "uploading" || progress > 0) && phase !== "done" ? (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Upload {progress}%</p>
          </div>
        ) : null}

        {localError ? (
          <p className="text-sm text-destructive">{localError}</p>
        ) : null}

        {(phase === "done" || phase === "error") && (
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
        )}
      </div>

      {transcript ? (
        <div className="space-y-2 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {transcript.text}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Segments JSON</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-2">
              {JSON.stringify(transcript.segments, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
