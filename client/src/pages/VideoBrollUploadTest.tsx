/**
 * THROWAWAY / DEV ONLY
 * Phase 2/3 test UI: optional client audio demux → dual R2 upload → poll.
 * Remove once real video B-roll UI ships. Do not link from nav or marketing.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { extractVideoAudio } from "@/lib/extractVideoAudio";
import { Button } from "@/components/ui/button";
import type { VideoBrollTranscript } from "@shared/videoBroll";

type Phase =
  | "idle"
  | "extracting"
  | "creating"
  | "uploading_audio"
  | "uploading_video"
  | "confirming"
  | "polling"
  | "done"
  | "error";

const POLL_MS = 2000;

function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
  xhrRef: { current: XMLHttpRequest | null }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(body);
  });
}

export default function VideoBrollUploadTest() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [audioProgress, setAudioProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [id, setId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [internalErrorDetail, setInternalErrorDetail] = useState<string | null>(
    null
  );
  const [transcript, setTranscript] = useState<VideoBrollTranscript | null>(
    null
  );
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [videoUploadStatus, setVideoUploadStatus] = useState<string | null>(
    null
  );
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState<string | null>(null);
  const [usedAudioExtract, setUsedAudioExtract] = useState<boolean | null>(
    null
  );
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  /** Dev: skip demux and force video-only fallback. */
  const [forceFallback, setForceFallback] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const createUpload = trpc.videoBroll.createUpload.useMutation();
  const confirmUpload = trpc.videoBroll.confirmUpload.useMutation();
  const confirmAudioUpload = trpc.videoBroll.confirmAudioUpload.useMutation();
  const confirmVideoUpload = trpc.videoBroll.confirmVideoUpload.useMutation();
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
    setVideoUploadStatus(data.videoUploadStatus);
    setSourceVideoUrl(data.sourceVideoUrl);
    setSourceAudioUrl(data.sourceAudioUrl);
    if (data.status === "failed") {
      setLocalError(data.errorMessage || "Transcription failed");
      setInternalErrorDetail(data.internalErrorDetail ?? null);
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
    setAudioProgress(0);
    setVideoProgress(0);
    setId(null);
    setLocalError(null);
    setInternalErrorDetail(null);
    setTranscript(null);
    setStatusLabel(null);
    setVideoUploadStatus(null);
    setSourceVideoUrl(null);
    setSourceAudioUrl(null);
    setUsedAudioExtract(null);
    setDurationSeconds(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    setLocalError(null);
    setInternalErrorDetail(null);
    setTranscript(null);
    setAudioProgress(0);
    setVideoProgress(0);
    setSourceVideoUrl(null);
    setSourceAudioUrl(null);

    const lower = file.name.toLowerCase();
    let contentType = file.type;
    if (!contentType) {
      if (lower.endsWith(".mov")) contentType = "video/quicktime";
      else if (lower.endsWith(".webm")) contentType = "video/webm";
      else contentType = "video/mp4";
    }

    try {
      let extracted: Awaited<ReturnType<typeof extractVideoAudio>> = null;
      if (!forceFallback) {
        setPhase("extracting");
        extracted = await extractVideoAudio(file, file.name);
      }
      setUsedAudioExtract(extracted != null);

      setPhase("creating");
      const created = await createUpload.mutateAsync({
        filename: file.name,
        contentType,
        contentLength: file.size,
        ...(extracted
          ? {
              audioContentType: extracted.contentType,
              audioContentLength: extracted.blob.size,
            }
          : {}),
      });
      setId(created.id);
      setSourceVideoUrl(created.sourceVideoUrl);
      setSourceAudioUrl(created.sourceAudioUrl);
      setVideoUploadStatus(created.videoUploadStatus);

      if (extracted && created.audioUploadUrl) {
        // Audio first: PUT → confirm → transcription starts; video in parallel after.
        setPhase("uploading_audio");
        await putWithProgress(
          created.audioUploadUrl,
          extracted.blob,
          extracted.contentType,
          setAudioProgress,
          xhrRef
        );
        xhrRef.current = null;

        setPhase("confirming");
        await confirmAudioUpload.mutateAsync({ id: created.id });
        setStatusLabel("uploading");
        setPhase("polling");

        // Background video: does not block polling / transcription.
        void (async () => {
          try {
            setPhase((p) => (p === "polling" ? p : "uploading_video"));
            await putWithProgress(
              created.uploadUrl,
              file,
              contentType,
              setVideoProgress,
              xhrRef
            );
            xhrRef.current = null;
            const videoResult = await confirmVideoUpload.mutateAsync({
              id: created.id,
              success: true,
            });
            setVideoUploadStatus(videoResult.videoUploadStatus);
          } catch (videoErr) {
            console.warn("[VideoBrollUploadTest] background video failed:", videoErr);
            try {
              const failResult = await confirmVideoUpload.mutateAsync({
                id: created.id,
                success: false,
              });
              setVideoUploadStatus(failResult.videoUploadStatus);
            } catch {
              setVideoUploadStatus("failed");
            }
          }
        })();
      } else {
        // Fallback: full video upload, then confirm (transcription waits on video).
        setPhase("uploading_video");
        await putWithProgress(
          created.uploadUrl,
          file,
          contentType,
          setVideoProgress,
          xhrRef
        );
        xhrRef.current = null;

        setPhase("confirming");
        await confirmUpload.mutateAsync({ id: created.id });
        setStatusLabel("uploading");
        setVideoUploadStatus("skipped");
        setPhase("polling");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      setPhase("error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
        THROWAWAY DEV PAGE (Phase 2/3). Client audio demux + dual upload test.
        Not a product surface.
      </p>

      <h1 className="text-xl font-semibold text-foreground">
        Video B-roll upload test
      </h1>
      <p className="text-sm text-muted-foreground">
        MP4 / MOV / WebM, max 200MB. Happy path: demux audio → upload audio →
        transcribe while video uploads in background. Fallback: video-only if
        demux fails.
      </p>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={forceFallback}
          disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
          onChange={(e) => setForceFallback(e.target.checked)}
        />
        Force video-only fallback (skip demux)
      </label>

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
          {videoUploadStatus ? (
            <span className="text-muted-foreground">
              videoUploadStatus:{" "}
              <span className="text-foreground">{videoUploadStatus}</span>
            </span>
          ) : null}
          {usedAudioExtract != null ? (
            <span className="text-muted-foreground">
              audioExtract:{" "}
              <span className="text-foreground">
                {usedAudioExtract ? "yes" : "fallback"}
              </span>
            </span>
          ) : null}
          {durationSeconds != null ? (
            <span className="text-muted-foreground">
              duration:{" "}
              <span className="text-foreground">{durationSeconds}s</span>
            </span>
          ) : null}
        </div>

        {(phase === "uploading_audio" || audioProgress > 0) &&
        phase !== "done" ? (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${audioProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Audio upload {audioProgress}%
            </p>
          </div>
        ) : null}

        {(phase === "uploading_video" || videoProgress > 0) &&
        phase !== "done" ? (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-sky-600 transition-all"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Video upload {videoProgress}%
            </p>
          </div>
        ) : null}

        {sourceAudioUrl ? (
          <p className="break-all text-xs text-muted-foreground">
            sourceAudioUrl: {sourceAudioUrl}
          </p>
        ) : null}
        {sourceVideoUrl ? (
          <p className="break-all text-xs text-muted-foreground">
            sourceVideoUrl: {sourceVideoUrl}
          </p>
        ) : null}

        {localError ? (
          <p className="text-sm text-destructive">{localError}</p>
        ) : null}
        {internalErrorDetail ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs text-muted-foreground">
            internalErrorDetail: {internalErrorDetail}
          </pre>
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
