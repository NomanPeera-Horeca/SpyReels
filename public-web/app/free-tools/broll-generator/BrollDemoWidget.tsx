"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrollLandingMatch } from "../../../../shared/brollLanding";
import { FieldTextarea } from "../../../components/FieldTextarea";
import { MarketingBadge } from "../../../components/MarketingBadge";
import { MarketingDialog } from "../../../components/MarketingDialog";
import { MarketingTabRow } from "../../../components/MarketingTabRow";
import { PrimaryButton } from "../../../components/PrimaryButton";
import {
  clearBrollPendingDownload,
  peekBrollPendingDownload,
  stashBrollPendingDownload,
} from "../../../lib/brollPendingDownload";
import type {
  BrollPendingPreview,
  BrollPreviewSnapshot,
} from "../../../lib/brollPendingPreview";
import { BROLL_LANDING_SAMPLE_SCRIPT } from "../../../lib/brollLandingCopy";
import { extractVideoAudio } from "../../../lib/extractVideoAudio";
import { trpcMutate, trpcQuery } from "../../../lib/trpcBrowser";
import {
  createWatermarkJobsApi,
  downloadClipWithWatermarkGate,
} from "../../../lib/watermarkDownload";
import styles from "./BrollGenerator.module.css";

type BrollDemoWidgetProps = {
  remaining: number | null;
  watermarked: boolean;
  canDownload: boolean;
  isAuthenticated: boolean;
  onQuotaChange: (remaining: number) => void;
  onSignUp: () => void;
  onDownloadUnlocked: (matches: BrollLandingMatch[]) => void;
  restorePending?: BrollPendingPreview | null;
  onRestoreConsumed?: () => void;
  onSnapshotChange?: (snapshot: BrollPreviewSnapshot) => void;
};

type Mode = "script" | "video";
type Phase = "idle" | "loading" | "results" | "error";

const POLL_MS = 2000;
const SKELETON_COUNT = 5;
const TABS = [
  { id: "script", label: "Paste Script" },
  { id: "video", label: "Upload Video" },
] as const;

function formatDuration(start: number, end: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  return `${fmt(start)}-${fmt(end)}`;
}

function putBlob(
  url: string,
  body: Blob,
  contentType: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function BrollDemoWidget({
  remaining,
  watermarked,
  canDownload,
  isAuthenticated,
  onQuotaChange,
  onSignUp,
  onDownloadUnlocked,
  restorePending = null,
  onRestoreConsumed,
  onSnapshotChange,
}: BrollDemoWidgetProps) {
  const [mode, setMode] = useState<Mode>("script");
  const [script, setScript] = useState(BROLL_LANDING_SAMPLE_SCRIPT);
  const [phase, setPhase] = useState<Phase>("idle");
  const [matches, setMatches] = useState<BrollLandingMatch[]>([]);
  const [beatsMatched, setBeatsMatched] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [showWatermark, setShowWatermark] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<number | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [rerollContext, setRerollContext] = useState("");
  const [rerollError, setRerollError] = useState<string | null>(null);
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rerollContextRef = useRef<HTMLInputElement>(null);
  const restoreAppliedRef = useRef(false);
  const autoDownloadStartedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  const previewMatch =
    previewIndex != null ? (matches[previewIndex] ?? null) : null;
  const previewIsNoMatch = previewMatch?.matchStatus === "no_match";
  const previewIsApproximate =
    !previewIsNoMatch && previewMatch?.matchConfidence === "approximate";

  useEffect(() => {
    if (
      previewIndex == null ||
      (!previewIsNoMatch && !previewIsApproximate) ||
      mode !== "script"
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      rerollContextRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [previewIndex, previewIsNoMatch, previewIsApproximate, mode]);

  useEffect(() => {
    if (!restorePending || restoreAppliedRef.current) return;
    restoreAppliedRef.current = true;
    setError(null);
    setPreviewIndex(null);
    setRerollContext("");
    setRerollError(null);

    if (restorePending.mode === "script") {
      setMode("script");
      setScript(restorePending.script || BROLL_LANDING_SAMPLE_SCRIPT);
      setMatches(restorePending.matches);
      setBeatsMatched(restorePending.beatsMatched);
      setTotalSeconds(restorePending.totalSeconds);
      setShowWatermark(watermarked);
      setVideoId(null);
      setAccessToken(null);
      setPhase("results");
    } else {
      setMode("video");
      setMatches([]);
      setBeatsMatched(0);
      setTotalSeconds(0);
      setShowWatermark(watermarked);
      setVideoId(restorePending.videoId);
      setAccessToken(restorePending.accessToken);
      setFileLabel("Restored upload");
      setPhase("loading");
    }
    onRestoreConsumed?.();
  }, [restorePending, onRestoreConsumed, watermarked]);

  useEffect(() => {
    onSnapshotChange?.({
      mode,
      script,
      matches,
      beatsMatched,
      totalSeconds,
      videoId,
      accessToken,
      phase,
    });
  }, [
    mode,
    script,
    matches,
    beatsMatched,
    totalSeconds,
    videoId,
    accessToken,
    phase,
    onSnapshotChange,
  ]);

  const pollVideo = useCallback(async () => {
    if (videoId == null || phase !== "loading" || mode !== "video") return;
    try {
      const data = await trpcQuery<{
        status: string;
        errorMessage?: string | null;
        matches: BrollLandingMatch[];
        beatsMatched: number;
        totalSeconds?: number;
        watermarked: boolean;
      }>("brollLanding.getVideo", {
        id: videoId,
        accessToken: accessToken ?? undefined,
      });
      if (data.status === "failed") {
        setError(data.errorMessage || "Video B-roll matching failed");
        setPhase("error");
        return;
      }
      if (data.status === "completed") {
        setMatches(data.matches);
        setBeatsMatched(data.beatsMatched);
        setTotalSeconds(data.totalSeconds || 0);
        setShowWatermark(data.watermarked);
        setPhase("results");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load video status");
      setPhase("error");
    }
  }, [videoId, accessToken, phase, mode]);

  useEffect(() => {
    if (videoId == null || phase !== "loading" || mode !== "video") {
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    void pollVideo();
    pollTimerRef.current = window.setInterval(() => {
      void pollVideo();
    }, POLL_MS);
    return () => {
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [videoId, phase, mode, pollVideo]);

  async function runScriptPreview() {
    const trimmed = script.trim();
    if (!trimmed) return;
    setError(null);
    setStatusMessage(null);
    setPhase("loading");
    setMatches([]);
    try {
      const result = await trpcMutate<{
        matches: BrollLandingMatch[];
        beatsMatched: number;
        totalSeconds: number;
        watermarked: boolean;
        remaining: number;
      }>("brollLanding.previewScript", { content: trimmed });
      setMatches(result.matches);
      setBeatsMatched(result.beatsMatched);
      setTotalSeconds(result.totalSeconds);
      setShowWatermark(result.watermarked);
      onQuotaChange(result.remaining);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setPhase("error");
    }
  }

  async function runVideoPreview(file: File) {
    setError(null);
    setStatusMessage(null);
    setPhase("loading");
    setMatches([]);
    setFileLabel(file.name);
    setVideoId(null);
    setAccessToken(null);

    try {
      const audio = await extractVideoAudio(file, file.name);
      const created = await trpcMutate<{
        id: number;
        accessToken: string | null;
        uploadUrl: string;
        audioUploadUrl?: string | null;
        remaining: number;
        watermarked: boolean;
      }>("brollLanding.createVideoUpload", {
        filename: file.name,
        contentType: file.type || "video/mp4",
        contentLength: file.size,
        ...(audio
          ? {
              audioContentType: audio.contentType,
              audioContentLength: audio.blob.size,
            }
          : {}),
      });

      onQuotaChange(created.remaining);
      setShowWatermark(created.watermarked);
      setVideoId(created.id);
      setAccessToken(created.accessToken);

      if (audio && created.audioUploadUrl) {
        await putBlob(created.audioUploadUrl, audio.blob, audio.contentType);
        await trpcMutate("brollLanding.confirmAudioUpload", {
          id: created.id,
          accessToken: created.accessToken ?? undefined,
        });
        void putBlob(created.uploadUrl, file, file.type || "video/mp4")
          .then(() =>
            trpcMutate("brollLanding.confirmVideoUpload", {
              id: created.id,
              accessToken: created.accessToken ?? undefined,
              success: true,
            })
          )
          .catch(() =>
            trpcMutate("brollLanding.confirmVideoUpload", {
              id: created.id,
              accessToken: created.accessToken ?? undefined,
              success: false,
            })
          );
      } else {
        await putBlob(created.uploadUrl, file, file.type || "video/mp4");
        await trpcMutate("brollLanding.confirmUpload", {
          id: created.id,
          accessToken: created.accessToken ?? undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  }

  function onGenerate() {
    if (mode === "script") {
      void runScriptPreview();
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an MP4 or MOV file first.");
      setPhase("error");
      return;
    }
    void runVideoPreview(file);
  }

  async function runMatchedDownloads(matched: BrollLandingMatch[]) {
    setPreparingDownload(true);
    setStatusMessage("Preparing your download…");
    const api = createWatermarkJobsApi();

    try {
      for (let i = 0; i < matched.length; i++) {
        const m = matched[i]!;
        const label = String(i + 1).padStart(2, "0");
        await downloadClipWithWatermarkGate(
          api,
          m.clipUrl,
          `broll-beat-${label}.mp4`,
          (p) => {
            if (p.phase === "preparing") {
              setStatusMessage("Preparing your download…");
            }
          }
        );
      }
      setStatusMessage(
        matched.length === 1
          ? "Clip downloaded."
          : `Downloaded ${matched.length} clips.`
      );
    } catch (err) {
      setStatusMessage(null);
      setError(err instanceof Error ? err.message : "Could not download clips");
    } finally {
      setPreparingDownload(false);
    }
  }

  async function onDownloadClick() {
    const matched = matches.filter(
      (m) => m.matchStatus === "matched" && m.clipUrl.trim()
    );
    if (matched.length === 0) {
      setError("No matched clips to download yet.");
      return;
    }

    if (!isAuthenticated) {
      stashBrollPendingDownload();
      onSignUp();
      return;
    }

    if (canDownload) {
      setPreparingDownload(true);
      try {
        onDownloadUnlocked(matched);
        setStatusMessage("Opening downloads…");
      } finally {
        setPreparingDownload(false);
      }
      return;
    }

    await runMatchedDownloads(matched);
  }

  useEffect(() => {
    if (!isAuthenticated || phase !== "results" || preparingDownload) return;
    if (autoDownloadStartedRef.current) return;
    if (!peekBrollPendingDownload()) return;
    const matched = matches.filter(
      (m) => m.matchStatus === "matched" && m.clipUrl.trim()
    );
    if (matched.length === 0) return;
    autoDownloadStartedRef.current = true;
    clearBrollPendingDownload();
    if (canDownload) {
      onDownloadUnlocked(matched);
    } else {
      void runMatchedDownloads(matched);
    }
  }, [
    isAuthenticated,
    phase,
    matches,
    preparingDownload,
    canDownload,
    onDownloadUnlocked,
  ]);

  function openBeatPreview(index: number) {
    if (!matches[index]) return;
    setPreviewIndex(index);
    setRerollContext("");
    setRerollError(null);
  }

  function closeBeatPreview() {
    setPreviewIndex(null);
    setRerollContext("");
    setRerollError(null);
  }

  async function onTryAgainWithContext() {
    if (previewIndex == null || !previewMatch || mode !== "script") return;
    const ctx = rerollContext.trim();
    if (!ctx) {
      setRerollError("Add a short hint, e.g. commercial kitchen.");
      return;
    }
    setRerollError(null);
    setRegenerateBusy(true);
    try {
      const result = await trpcMutate<{ match: BrollLandingMatch }>(
        "brollLanding.regenerateBeat",
        {
          beat: previewMatch.beat,
          keyword: previewMatch.keyword,
          searchQuery: previewMatch.keyword,
          visualSummary: previewMatch.beat,
          userContext: ctx,
          excludeUrls: [previewMatch.clipUrl, previewMatch.posterUrl].filter(
            Boolean
          ),
          start: previewMatch.start,
          end: previewMatch.end,
          source: previewMatch.source,
        }
      );
      setMatches((prev) => {
        const next = [...prev];
        next[previewIndex] = result.match;
        setBeatsMatched(
          next.filter((m) => m.matchStatus === "matched").length
        );
        return next;
      });
      setRerollContext("");
    } catch (err) {
      setRerollError(
        err instanceof Error ? err.message : "Could not find a better clip"
      );
    } finally {
      setRegenerateBusy(false);
    }
  }

  const loading = phase === "loading";
  const showResults = phase === "results" || phase === "loading";
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const quotaBadge =
    remaining == null
      ? "Free previews available"
      : `${remaining} generation${remaining === 1 ? "" : "s"} left today`;

  return (
    <div id="demo" className={cx(styles.demoPanel, "demo-panel-root")}>
      <div className={styles.demoTopRow}>
        <MarketingTabRow
          tabs={TABS}
          active={mode}
          onChange={(id) => setMode(id as Mode)}
          aria-label="Input mode"
        />
        <MarketingBadge tone="neutral" className={styles.quotaLabel}>
          {quotaBadge}
        </MarketingBadge>
      </div>

      {mode === "script" ? (
        <div className={styles.uploadHint}>
          <FieldTextarea
            id="script-input"
            label="Your script"
            hideLabel
            rows={6}
            spellCheck={false}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste your script here…"
          />
        </div>
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime"
            className={styles.visuallyHidden}
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFileLabel(f?.name ?? null);
              setError(null);
            }}
          />
          <button
            type="button"
            className={styles.uploadZone}
            onClick={() => fileRef.current?.click()}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={styles.uploadIcon}
            >
              <path
                d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <p className="sr-text-product-label">
              {fileLabel || "Drop an MP4 or MOV here"}
            </p>
            <p className={cx("sr-text-product-body-small", styles.uploadHint)}>
              We transcribe the audio and match B-roll to your existing timeline.
            </p>
            <span className={cx("sr-text-product-label", styles.uploadChoose)}>
              Choose a file
            </span>
          </button>
        </div>
      )}

      <PrimaryButton
        type="button"
        disabled={loading}
        onClick={onGenerate}
        className={styles.generateBtn}
        trailingIcon={false}
      >
        {loading
          ? mode === "video"
            ? "Transcribing and matching…"
            : "Matching beats to footage…"
          : phase === "results"
            ? "Regenerate preview"
            : "Generate My B-Roll Preview"}
      </PrimaryButton>

      {!isAuthenticated ? (
        <p className={cx("sr-text-product-caption", styles.anonNote)}>
          Anonymous previews include a watermark. Full resolution, no duration
          cap.
        </p>
      ) : null}

      {error ? <p className={cx("sr-text-product-body-small", styles.errorBox)}>{error}</p> : null}
      {statusMessage ? (
        <p className={cx("sr-text-product-caption", styles.statusBox)} role="status">
          {statusMessage}
        </p>
      ) : null}

      {showResults ? (
        <div className={styles.resultsBlock}>
          <div className={styles.resultsHeader}>
            <h2 className="sr-text-product-label">Matched B-roll</h2>
            <span className={cx("sr-text-product-caption", styles.resultsMeta)}>
              {phase === "results"
                ? `${beatsMatched} beats matched · ${totalSeconds}s`
                : ""}
            </span>
          </div>
          <div className={styles.matchGrid}>
            {loading
              ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                  <div key={i}>
                    <div className={styles.skeleton} />
                    <div className={styles.skeletonLine} />
                  </div>
                ))
              : matches.map((m, i) => {
                  const isNoMatch = m.matchStatus === "no_match";
                  const isApproximate =
                    !isNoMatch && m.matchConfidence === "approximate";
                  return (
                    <figure
                      key={`${m.keyword}-${i}`}
                      className={styles.clipIn}
                      style={{
                        animationDelay: reduceMotion ? "0ms" : `${i * 80}ms`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openBeatPreview(i)}
                        className={cx(
                          styles.matchButton,
                          isNoMatch && styles.matchButtonNoMatch,
                          isApproximate && styles.matchButtonApprox,
                          !isNoMatch &&
                            (showWatermark || watermarked) &&
                            styles.watermarkTile
                        )}
                        aria-label={
                          isNoMatch
                            ? `No matching clip for beat: ${m.beat}. Add context to try again.`
                            : isApproximate
                              ? `Approximate B-roll for beat: ${m.beat}. Add context to try again.`
                              : `Play matched B-roll for beat: ${m.beat}`
                        }
                      >
                        <div className={styles.matchThumb}>
                          {isNoMatch ? (
                            <div className={styles.noMatchInner}>
                              <span className="sr-text-product-caption">
                                No matching clip found
                              </span>
                              <span className="sr-text-product-caption">
                                Add context to try again
                              </span>
                            </div>
                          ) : m.posterUrl || m.clipUrl ? (
                            <img
                              src={m.posterUrl || m.clipUrl}
                              alt={`Matched B-roll: ${m.keyword}`}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className={styles.noMatchInner}>
                              No preview
                            </div>
                          )}
                          {!isNoMatch && m.clipUrl ? (
                            <span className={styles.playOverlay}>
                              <span className={styles.playBadge}>
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 16 16"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path d="M4.5 2.8v10.4L13.2 8 4.5 2.8z" />
                                </svg>
                              </span>
                            </span>
                          ) : null}
                          {isApproximate ? (
                            <span className={styles.approxBadge}>Approximate match</span>
                          ) : null}
                          {!isNoMatch && (showWatermark || watermarked) ? (
                            <span className={styles.watermarkWord}>SpyReels</span>
                          ) : null}
                        </div>
                      </button>
                      <figcaption className="sr-text-product-caption">
                        Beat: &quot;{m.beat}&quot;
                      </figcaption>
                      <p className="sr-text-product-caption">
                        {m.keyword}
                        {isNoMatch
                          ? " · No match"
                          : ` · ${m.source === "ai" ? "AI" : "Stock"}${isApproximate ? " · Approximate" : ""} · ${formatDuration(m.start, m.end)}`}
                      </p>
                    </figure>
                  );
                })}
          </div>

          {phase === "results" && !isAuthenticated ? (
            <div className={styles.signupBanner}>
              <p className="sr-text-product-body-small">
                Sign up free to remove the watermark and save this project.
              </p>
              <PrimaryButton type="button" onClick={onSignUp} trailingIcon={false}>
                Sign up free
              </PrimaryButton>
            </div>
          ) : null}

          {phase === "results" ? (
            <SecondaryDownloadButton
              busy={preparingDownload}
              onClick={() => void onDownloadClick()}
            />
          ) : null}
        </div>
      ) : null}

      <MarketingDialog
        open={previewMatch != null}
        onClose={closeBeatPreview}
        size="medium"
        title={
          previewMatch
            ? previewIsNoMatch
              ? `No matching clip: ${previewMatch.beat}`
              : previewIsApproximate
                ? `Approximate B-roll: ${previewMatch.beat}`
                : `Matched B-roll: ${previewMatch.beat}`
            : "Matched B-roll clip"
        }
      >
        {previewMatch ? (
          <>
            {previewIsNoMatch ? (
              <div className={styles.noMatchInner}>
                <p className="sr-text-product-label">No matching clip found</p>
                <p className="sr-text-product-body-small">
                  Add a short hint below and try again.
                </p>
              </div>
            ) : (
              <div className={styles.previewVideoWrap}>
                <video
                  key={previewMatch.clipUrl}
                  className={styles.previewVideo}
                  src={previewMatch.clipUrl}
                  poster={previewMatch.posterUrl || undefined}
                  controls
                  playsInline
                />
                {previewIsApproximate ? (
                  <span className={styles.approxBadge}>Approximate match</span>
                ) : null}
              </div>
            )}
            <div className={styles.previewMeta}>
              <div>
                <p className="sr-text-product-label">
                  Beat: &quot;{previewMatch.beat}&quot;
                </p>
                <p className="sr-text-product-caption">
                  {previewMatch.keyword}
                  {previewIsNoMatch
                    ? " · No match"
                    : ` · ${previewMatch.source === "ai" ? "AI" : "Stock"}${previewIsApproximate ? " · Approximate" : ""} · ${formatDuration(previewMatch.start, previewMatch.end)}`}
                </p>
              </div>
              {mode === "script" ? (
                <div className={styles.rerollRow}>
                  <label
                    htmlFor="broll-reroll-context"
                    className="sr-text-product-caption"
                  >
                    {previewIsNoMatch || previewIsApproximate
                      ? "Add context and try again"
                      : "Wrong match? Add context and try again"}
                  </label>
                  <div className={styles.rerollRowControls}>
                    <input
                      id="broll-reroll-context"
                      ref={rerollContextRef}
                      type="text"
                      maxLength={120}
                      value={rerollContext}
                      onChange={(e) => setRerollContext(e.target.value)}
                      placeholder="e.g. commercial kitchen"
                      className={styles.rerollInput}
                    />
                    <PrimaryButton
                      type="button"
                      disabled={regenerateBusy}
                      onClick={() => void onTryAgainWithContext()}
                      trailingIcon={false}
                    >
                      {regenerateBusy ? "Searching…" : "Regenerate match"}
                    </PrimaryButton>
                  </div>
                  {rerollError ? (
                    <p className="sr-text-product-caption">{rerollError}</p>
                  ) : (
                    <p className="sr-text-product-caption">
                      Free re-search. Does not use a daily generation.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </MarketingDialog>
    </div>
  );
}

function SecondaryDownloadButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cx("sr-secondary-button", "sr-secondary-button-medium", styles.downloadBtn)}
    >
      {busy ? "Preparing your download…" : "Download full resolution"}
    </button>
  );
}
