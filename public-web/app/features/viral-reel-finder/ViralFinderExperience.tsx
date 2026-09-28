"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { InstagramMark } from "../../../../shared/ui/PlatformMarks";
import { resolvePublicAppOrigin } from "../../../lib/appOrigin";
import { trackPublicWeb } from "../../../lib/trackPublicWeb";
import interactionStyles from "./interaction.module.css";
import styles from "./page.module.css";

const DEMO_HANDLES = ["garyvee", "humphreytalks", "russellbrunson", "codiesanchez"] as const;
const DEMO_HANDLE_SET = new Set<string>(DEMO_HANDLES);

type SortMode = "views" | "engagement";

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
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return Math.round(value).toLocaleString();
}

function hookPreview(caption: string): string {
  const cleaned = (caption || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Open this Reel to study the hook";
  return cleaned.length > 110 ? `${cleaned.slice(0, 107)}...` : cleaned;
}

function appOrigin(): string {
  return resolvePublicAppOrigin({
    configured: process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN,
    hostname: typeof window !== "undefined" ? window.location.hostname : null,
  });
}

function handoffToResearch(handle: string, source: "form" | "selected_reel") {
  trackPublicWeb("viral_finder_research_cta_clicked", { handle, source });
  trackPublicWeb("viral_finder_app_handoff", {
    handle,
    source,
    return_to: "/research",
    auth: "signup",
  });
  const url = new URL(`${appOrigin()}/`);
  url.searchParams.set("auth", "signup");
  url.searchParams.set("returnTo", "/research");
  url.searchParams.set("researchHandle", handle);
  window.location.assign(url.toString());
}

function revealIfNeeded(id: string) {
  const panel = document.getElementById(id);
  if (!panel) return;

  const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 64;
  const rect = panel.getBoundingClientRect();
  const hidden = rect.top > window.innerHeight * 0.82 || rect.bottom < headerHeight + 24;
  if (!hidden) return;

  const top = rect.top + window.scrollY - headerHeight - 12;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export default function ViralFinderExperience() {
  const [input, setInput] = useState("");
  const [previewHandle, setPreviewHandle] = useState<string | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("views");
  const [showAll, setShowAll] = useState(false);
  const [selectedReel, setSelectedReel] = useState<DemoReel | null>(null);
  const [showSpyReelsNext, setShowSpyReelsNext] = useState(false);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [finderReady, setFinderReady] = useState(false);

  useEffect(() => {
    setFinderReady(true);
  }, []);

  useEffect(() => {
    if (!previewHandle) {
      setDemo(null);
      setDemoError(null);
      setLoading(false);
      setSelectedReel(null);
      setShowAll(false);
      setShowSpyReelsNext(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setDemoError(null);
    setSelectedReel(null);
    setShowAll(false);
    setShowSpyReelsNext(false);

    const endpoint = DEMO_HANDLE_SET.has(previewHandle) ? "demo" : "search";
    fetch(`/features/viral-reel-finder/${endpoint}?handle=${encodeURIComponent(previewHandle)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as DemoPayload | { error?: string };
        if (!response.ok || !("reels" in body)) {
          throw new Error("error" in body && body.error ? body.error : "Reel search is unavailable right now.");
        }
        return body;
      })
      .then((body) => setDemo(body))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDemo(null);
        setDemoError(error instanceof Error ? error.message : "Reel search is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [previewHandle, searchAttempt]);

  useEffect(() => {
    if (!previewHandle || loading) return;
    window.requestAnimationFrame(() => revealIfNeeded("reel-preview"));
  }, [previewHandle, loading, demo]);

  const sortedReels = useMemo(() => {
    const copy = [...(demo?.reels ?? [])];
    if (sortMode === "engagement") {
      copy.sort((a, b) => b.engagementRate - a.engagementRate);
    } else {
      copy.sort((a, b) => b.viewCount - a.viewCount);
    }
    return copy;
  }, [demo, sortMode]);

  const visibleReels = showAll ? sortedReels : sortedReels.slice(0, 4);
  const selectedOwner = demo?.handle ?? previewHandle ?? "";
  const continueHandle = selectedOwner;
  const showPreview = Boolean(previewHandle);

  function chooseDemo(handle: string) {
    setInput(handle);
    setPreviewHandle(handle);
    setSearchAttempt((attempt) => attempt + 1);
    trackPublicWeb("viral_finder_demo_handle_selected", { handle });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nativeValue = String(new FormData(event.currentTarget).get("handle") ?? "");
    const handle = normalizeHandle(nativeValue || input);
    if (handle !== input) {
      setInput(nativeValue || handle);
    }
    if (!handle || !validHandle(handle)) {
      setProfileError("Enter a valid Instagram username or profile link.");
      return;
    }
    setProfileError(null);
    setPreviewHandle(handle);
    setSearchAttempt((attempt) => attempt + 1);
  }

  function selectReel(reel: DemoReel) {
    setSelectedReel(reel);
    setShowSpyReelsNext(false);
    trackPublicWeb("viral_finder_reel_selected", {
      handle: selectedOwner,
      reel_id: reel.id,
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => revealIfNeeded("selected-reel-next"));
    });
  }

  function changeSort(next: SortMode) {
    setSortMode(next);
    trackPublicWeb("viral_finder_sort_changed", { sort: next, handle: selectedOwner });
  }

  const submitLabel = loading ? "Finding Reels…" : "Find viral Reels";

  return (
    <div id="live-demo" className={styles.experience}>
      <div className={styles.finderIsland}>
        <form
          className={styles.finderForm}
          onSubmit={submit}
          data-finder-ready={finderReady ? "true" : "false"}
        >
          <span className={styles.platformMark} aria-hidden>
            <InstagramMark />
          </span>
          <label className={styles.srOnly} htmlFor="viral-finder-handle">Instagram username or profile link</label>
          <input
            id="viral-finder-handle"
            name="handle"
            className={styles.finderInput}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setProfileError(null);
              setPreviewHandle(null);
            }}
            placeholder="@username or instagram.com/username"
            autoComplete="off"
          />
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={loading}
          >
            {submitLabel}
          </button>
        </form>

        {profileError ? <p className={styles.formError}>{profileError}</p> : null}

        <div className={styles.tryRow}>
          <span>Or try an example:</span>
          {DEMO_HANDLES.map((handle) => (
            <button
              type="button"
              className={previewHandle === handle ? interactionStyles.demoHandleActive : undefined}
              aria-pressed={previewHandle === handle}
              onClick={() => chooseDemo(handle)}
              key={handle}
            >
              @{handle}
            </button>
          ))}
        </div>
      </div>

      {showPreview ? (
        <section id="reel-preview" className={styles.preview} aria-label="Interactive Viral Reel Finder product example">
          <div className={styles.previewHeader}>
            <div>
              <small>{DEMO_HANDLE_SET.has(previewHandle ?? "") ? "Reel example" : "Reel results"}</small>
              <strong>@{demo?.handle ?? previewHandle}</strong>
              <span>{demo ? `${demo.totalReelCount} Reels found` : loading ? "Finding Reels" : "Account unavailable"}</span>
            </div>
            <div className={styles.sortTabs} aria-label="Sort example Reels">
              <button className={sortMode === "views" ? styles.activeSort : undefined} type="button" aria-pressed={sortMode === "views"} onClick={() => changeSort("views")}>Views</button>
              <button className={sortMode === "engagement" ? styles.activeSort : undefined} type="button" aria-pressed={sortMode === "engagement"} onClick={() => changeSort("engagement")}>Engagement</button>
            </div>
          </div>

          {loading ? (
            <div className={styles.demoState}>Loading Reel data…</div>
          ) : demoError || !demo ? (
            <div className={styles.demoState} role="alert">{demoError ?? "Reels are unavailable right now. Please try again."}</div>
          ) : demo.reels.length === 0 ? (
            <div className={styles.demoState}>
              <p>No public Reels came back for @{demo.handle}. Try another creator.</p>
              <button type="button" className={styles.primaryButton} onClick={() => handoffToResearch(demo.handle, "form")}>
                Research @{demo.handle} in SpyReels
              </button>
            </div>
          ) : (
            <>
              <div className={styles.previewGrid}>
                {visibleReels.map((reel) => {
                  const selected = selectedReel?.id === reel.id;
                  return (
                    <article
                      className={`${styles.previewCard} ${selected ? interactionStyles.selectedReelCard : ""}`}
                      key={reel.id}
                    >
                      <button
                        className={styles.reelSelect}
                        type="button"
                        data-testid="reel-card"
                        aria-pressed={selected}
                        onClick={() => selectReel(reel)}
                      >
                        <div
                          className={styles.previewArt}
                          style={{
                            backgroundImage: `linear-gradient(180deg, transparent 48%, rgba(0,0,0,.9)), url(${JSON.stringify(reel.thumbnailUrl).slice(1, -1)})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        >
                          <strong>{formatNumber(reel.viewCount)} views</strong>
                        </div>
                        <div className={styles.previewBody}>
                          <small>Opening hook</small>
                          <p>{hookPreview(reel.caption)}</p>
                          <span>{reel.engagementRate > 0 ? `${reel.engagementRate.toFixed(1)}% engagement` : "Engagement unavailable"}</span>
                          <b>{selected ? "Selected" : "Open this Reel"}</b>
                        </div>
                      </button>
                    </article>
                  );
                })}
              </div>

              {sortedReels.length > 4 ? (
                <div className={`${styles.previewFooter} ${interactionStyles.previewFooterSingle}`}>
                  <button type="button" className={styles.textButton} onClick={() => setShowAll((value) => !value)}>
                    {showAll ? "Show fewer Reels" : `Show all ${sortedReels.length} Reels`}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {selectedReel ? (
        <section id="selected-reel-next" className={styles.nextStepPanel} aria-label="Selected Reel">
          <div className={styles.nextStepMedia} style={{ backgroundImage: `url(${JSON.stringify(selectedReel.thumbnailUrl).slice(1, -1)})` }} />
          <div className={styles.nextStepCopy}>
            <small>This Reel</small>
            <h2>{hookPreview(selectedReel.caption)}</h2>
            <p>
              {formatNumber(selectedReel.viewCount)} views
              {selectedReel.engagementRate > 0 ? ` · ${selectedReel.engagementRate.toFixed(1)}% engagement` : ""}
            </p>

            {!showSpyReelsNext ? (
              <button
                type="button"
                className={styles.secondaryButton}
                data-testid="reveal-spyreels-next"
                onClick={() => setShowSpyReelsNext(true)}
              >
                What SpyReels can do next
              </button>
            ) : (
              <>
                <div className={interactionStyles.stepDetail} data-testid="workflow-step-detail" data-step="next">
                  <small>Inside SpyReels</small>
                  <strong>Transcribe this Reel, then write your own version.</strong>
                  <p>SpyReels keeps this post as research context so you can study the spoken content and turn the useful idea into an original script.</p>
                </div>
                <button type="button" className={styles.primaryButton} onClick={() => handoffToResearch(continueHandle, "selected_reel")}>
                  {continueHandle && continueHandle !== selectedOwner
                    ? `Research @${continueHandle} in SpyReels`
                    : `Continue @${selectedOwner} in SpyReels`}
                </button>
                <span className={interactionStyles.actionHint}>Opens Research with @{continueHandle} selected.</span>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
