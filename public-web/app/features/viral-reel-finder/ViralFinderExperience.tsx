"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const DEMO_HANDLES = ["garyvee", "humphreytalks", "russellbrunson", "codiesanchez"] as const;
const DEMO_HANDLE_SET = new Set<string>(DEMO_HANDLES);

type SortMode = "outlier" | "views" | "engagement";
type ConversionIntent = "research" | "remake";

type DemoReel = {
  id: number;
  reelShortcode: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  thumbnailUrl: string;
};

type DemoPayload = {
  handle: string;
  totalReelCount: number;
  medianViewCount: number;
  reels: DemoReel[];
};

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").toLowerCase();
}

function validHandle(handle: string): boolean {
  return /^[a-z0-9._]{1,30}$/i.test(handle);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  }
  return Math.round(value).toLocaleString();
}

function outlierMultiple(viewCount: number, median: number): number {
  if (!median || median <= 0 || !viewCount) return 0;
  return viewCount / median;
}

function formatOutlier(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "";
  return `${value >= 10 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")}x median`;
}

function hookPreview(caption: string): string {
  const cleaned = (caption || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Open this Reel to study the hook";
  return cleaned.length > 92 ? `${cleaned.slice(0, 89)}...` : cleaned;
}

function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "spyreels.ai") {
    return window.location.origin;
  }
  return "https://spyreels.ai";
}

function stashResearchHandle(handle?: string) {
  if (!handle) return;
  try {
    sessionStorage.setItem("spyreels:research_pending_handle", handle);
    sessionStorage.setItem("spyreels:research_autostart", "1");
    sessionStorage.setItem("spyreels:research_pending_platform", "instagram");
  } catch {
    // Storage is an enhancement only. Auth still works if the browser blocks it.
  }
}

function googleAuthUrl(returnTo = "/research"): string {
  const state = btoa(
    JSON.stringify({
      v: 1,
      utm: {},
      returnTo,
      firstReferrer: null,
    })
  );
  return `${appOrigin()}/api/auth/google?state=${encodeURIComponent(state)}`;
}

export default function ViralFinderExperience() {
  const [input, setInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string>(DEMO_HANDLES[0]);
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("outlier");
  const [showAll, setShowAll] = useState(false);
  const [selectedReelId, setSelectedReelId] = useState<number | null>(null);
  const [conversionIntent, setConversionIntent] = useState<ConversionIntent | null>(null);
  const [pendingHandle, setPendingHandle] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setShowAll(false);
    setSelectedReelId(null);

    fetch(`/features/viral-reel-finder/demo?handle=${encodeURIComponent(activeHandle)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as DemoPayload | { error?: string };
        if (!response.ok || !("reels" in body)) {
          throw new Error("error" in body && body.error ? body.error : "Demo unavailable");
        }
        return body;
      })
      .then((body) => setDemo(body))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setDemo(null);
        setError(err instanceof Error ? err.message : "The demo catalog is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeHandle]);

  const sortedReels = useMemo(() => {
    const copy = [...(demo?.reels ?? [])];
    if (sortMode === "views") {
      copy.sort((a, b) => b.viewCount - a.viewCount);
    } else if (sortMode === "engagement") {
      copy.sort((a, b) => b.engagementRate - a.engagementRate);
    } else {
      copy.sort((a, b) => {
        const delta =
          outlierMultiple(b.viewCount, demo?.medianViewCount ?? 0) -
          outlierMultiple(a.viewCount, demo?.medianViewCount ?? 0);
        return delta || b.viewCount - a.viewCount;
      });
    }
    return copy;
  }, [demo, sortMode]);

  const selectedReel = useMemo(() => {
    if (!sortedReels.length) return null;
    return sortedReels.find((reel) => reel.id === selectedReelId) ?? sortedReels[0];
  }, [selectedReelId, sortedReels]);

  const visibleReels = showAll ? sortedReels : sortedReels.slice(0, 4);

  function chooseDemo(handle: string) {
    setInput(handle);
    setActiveHandle(handle);
    setTimeout(
      () => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0
    );
  }

  function openConversion(intent: ConversionIntent, handle?: string) {
    const normalized = handle ? normalizeHandle(handle) : demo?.handle ?? activeHandle;
    if (normalized && validHandle(normalized)) stashResearchHandle(normalized);
    setPendingHandle(normalized || null);
    setConversionIntent(intent);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = normalizeHandle(input);
    if (!handle || !validHandle(handle)) {
      setError("Enter a valid Instagram username or profile link.");
      return;
    }
    if (DEMO_HANDLE_SET.has(handle)) {
      chooseDemo(handle);
      return;
    }
    openConversion("research", handle);
  }

  function selectForRemake(reel: DemoReel) {
    setSelectedReelId(reel.id);
    setTimeout(
      () => document.getElementById("remake-preview")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0
    );
  }

  function continueFree() {
    stashResearchHandle(pendingHandle ?? demo?.handle ?? activeHandle);
    window.location.assign(googleAuthUrl("/research"));
  }

  return (
    <>
      <div id="try-finder" className={styles.finderIsland}>
        <form className={styles.finderForm} onSubmit={submit}>
          <span className={styles.platformMark} aria-hidden>◎</span>
          <label className={styles.srOnly} htmlFor="viral-finder-handle">
            Instagram username or profile link
          </label>
          <input
            id="viral-finder-handle"
            className={styles.finderInput}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="@username or instagram.com/username"
            autoComplete="off"
          />
          <button className={styles.primaryButton} type="submit">Find Viral Reels</button>
        </form>
        <div className={styles.finderMeta}>
          <p className={styles.tryHandles}>
            Try{" "}
            {DEMO_HANDLES.map((handle, index) => (
              <span key={handle}>
                {index > 0 ? " · " : null}
                <button type="button" onClick={() => chooseDemo(handle)}>@{handle}</button>
              </span>
            ))}
          </p>
          <span className={styles.freeNote}>Free demo · real curated data · no card</span>
        </div>
        {error && !demo ? <p className={styles.formError}>{error}</p> : null}
      </div>

      <section id="results" className={styles.preview} aria-label="Viral Reel Finder results preview">
        <div className={styles.previewHeader}>
          <div>
            <span className={styles.previewKicker}>Live product preview</span>
            <strong>@{demo?.handle ?? activeHandle}</strong>
            <span className={styles.statsNote}>
              {demo
                ? `${demo.totalReelCount} Reels · median ${formatNumber(demo.medianViewCount)} views`
                : loading
                  ? "Loading catalog"
                  : "Catalog unavailable"}
            </span>
          </div>
          <div className={styles.sortGroup} aria-label="Sort demo Reels">
            {(["outlier", "views", "engagement"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={sortMode === mode ? styles.sortActive : styles.sortButton}
                onClick={() => setSortMode(mode)}
              >
                {mode === "outlier" ? "Outlier score" : mode}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className={styles.previewState}>Loading top Reels…</div>
        ) : error && !demo ? (
          <div className={styles.previewState}>
            The live demo is unavailable right now. Try again in a moment.
          </div>
        ) : (
          <div className={styles.previewGrid}>
            {visibleReels.map((reel) => {
              const multiple = formatOutlier(outlierMultiple(reel.viewCount, demo?.medianViewCount ?? 0));
              return (
                <article className={styles.previewCard} key={reel.id}>
                  <div
                    className={styles.previewArt}
                    style={{
                      backgroundImage: `linear-gradient(180deg, transparent 48%, rgba(0,0,0,.88)), url(${JSON.stringify(reel.thumbnailUrl).slice(1, -1)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    {multiple ? <span className={styles.outlierBadge}>{multiple}</span> : null}
                    <strong>{formatNumber(reel.viewCount)} views</strong>
                  </div>
                  <div className={styles.previewBody}>
                    <span className={styles.statsNote}>Hook · first seconds</span>
                    <p>{hookPreview(reel.caption)}</p>
                    <div className={styles.cardActionRow}>
                      <span className={styles.statsNote}>
                        {reel.engagementRate > 0 ? `${reel.engagementRate.toFixed(1)}% eng.` : "eng. n/a"}
                      </span>
                      <button type="button" onClick={() => selectForRemake(reel)}>See remake flow →</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && sortedReels.length > 4 ? (
          <div className={styles.previewFooter}>
            <button className={styles.textButton} type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show fewer demo Reels" : `Show all ${sortedReels.length} demo Reels`}
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => openConversion("research")}>
              Research my own account
            </button>
          </div>
        ) : null}
      </section>

      {selectedReel ? (
        <section id="remake-preview" className={styles.remakeStage} aria-label="How SpyReels turns research into a new script">
          <div className={styles.remakeIntro}>
            <span className={styles.previewKicker}>What happens next</span>
            <h2>From a winning Reel to your own ready-to-film direction.</h2>
            <p>Click any Reel above. SpyReels carries the useful pattern forward instead of dropping you on another marketing page.</p>
          </div>

          <div className={styles.remakeVisual}>
            <div className={styles.selectedReel}>
              <div
                className={styles.selectedReelArt}
                style={{
                  backgroundImage: `linear-gradient(180deg, transparent 48%, rgba(0,0,0,.9)), url(${JSON.stringify(selectedReel.thumbnailUrl).slice(1, -1)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <span className={styles.outlierBadge}>
                  {formatOutlier(outlierMultiple(selectedReel.viewCount, demo?.medianViewCount ?? 0)) || "Top Reel"}
                </span>
                <strong>{formatNumber(selectedReel.viewCount)} views</strong>
              </div>
              <p>{hookPreview(selectedReel.caption)}</p>
            </div>

            <div className={styles.flowArrow} aria-hidden>→</div>

            <div className={styles.outputMock}>
              <div className={styles.outputTopbar}>
                <span>SpyReels remake workflow</span>
                <span className={styles.liveDot}>●</span>
              </div>
              <div className={styles.outputSteps}>
                <div>
                  <small>01 · Understand</small>
                  <strong>Why this Reel beat the account baseline</strong>
                  <p>Outlier score, hook and repeated pattern stay visible together.</p>
                </div>
                <div>
                  <small>02 · Reframe</small>
                  <strong>Keep the pattern. Change the angle and language.</strong>
                  <p>Turn the research into an original direction for your niche and audience.</p>
                </div>
                <div>
                  <small>03 · Create</small>
                  <strong>Move into script + production guidance</strong>
                  <p>Continue with what to say, what to show and how to structure the Reel.</p>
                </div>
              </div>
              <button className={styles.primaryButton} type="button" onClick={() => openConversion("remake")}>
                Create my version free
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {conversionIntent ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setConversionIntent(null)}>
          <div
            className={styles.conversionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversion-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className={styles.modalClose} type="button" onClick={() => setConversionIntent(null)} aria-label="Close">×</button>
            <span className={styles.previewKicker}>{conversionIntent === "remake" ? "Continue the remake" : "Unlock your own research"}</span>
            <h2 id="conversion-title">
              {conversionIntent === "remake"
                ? "Take this Reel into your own content workflow."
                : pendingHandle
                  ? `Research @${pendingHandle} in SpyReels.`
                  : "Research any public creator in SpyReels."}
            </h2>
            <p>
              Create a free account, then continue directly into the Research tool. No generic marketing-page detour.
            </p>
            <div className={styles.modalBenefits}>
              <span>✓ Rank public Reels by performance</span>
              <span>✓ Continue winners into your own script direction</span>
              <span>✓ No credit card to start</span>
            </div>
            <button className={styles.modalPrimary} type="button" onClick={continueFree}>
              Continue free with Google →
            </button>
            <button className={styles.modalSecondary} type="button" onClick={() => setConversionIntent(null)}>
              Keep exploring the demo
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
