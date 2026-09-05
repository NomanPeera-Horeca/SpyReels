"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const DEMO_HANDLES = ["garyvee", "humphreytalks", "russellbrunson", "codiesanchez"] as const;
const DEMO_HANDLE_SET = new Set<string>(DEMO_HANDLES);

type SortMode = "outlier" | "views" | "engagement";

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

function handoffToResearch(handle?: string) {
  if (handle) {
    try {
      sessionStorage.setItem("spyreels:research_pending_handle", handle);
      sessionStorage.setItem("spyreels:research_autostart", "1");
      sessionStorage.setItem("spyreels:research_pending_platform", "instagram");
    } catch {
      // Browser storage is optional; the Research page still opens without it.
    }
  }
  window.location.assign(`${appOrigin()}/research`);
}

export default function ViralFinderExperience() {
  const [input, setInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string>(DEMO_HANDLES[0]);
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("outlier");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

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
        const delta = outlierMultiple(b.viewCount, demo?.medianViewCount ?? 0) - outlierMultiple(a.viewCount, demo?.medianViewCount ?? 0);
        return delta || b.viewCount - a.viewCount;
      });
    }
    return copy;
  }, [demo, sortMode]);

  function chooseDemo(handle: string) {
    setInput(handle);
    setActiveHandle(handle);
    setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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
    handoffToResearch(handle);
  }

  return (
    <>
      <div className={styles.finderIsland}>
        <form className={styles.finderForm} onSubmit={submit}>
          <span className={styles.platformMark} aria-hidden>◎</span>
          <label className={styles.srOnly} htmlFor="viral-finder-handle">Instagram username or profile link</label>
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
        <p className={styles.tryHandles}>
          or try{" "}
          {DEMO_HANDLES.map((handle, index) => (
            <span key={handle}>
              {index > 0 ? " · " : null}
              <button type="button" onClick={() => chooseDemo(handle)}>@{handle}</button>
            </span>
          ))}
        </p>
        {error && !demo ? <p className={styles.formError}>{error}</p> : null}
      </div>

      <section id="results" className={styles.preview} aria-label="Viral Reel Finder results preview" style={{ marginTop: 42, textAlign: "left" }}>
        <div className={styles.previewHeader}>
          <span>Results preview</span>
          <span className={styles.statsNote}>Live curated SpyReels data</span>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "16px 18px" }}>
          <div>
            <strong>@{demo?.handle ?? activeHandle}</strong>
            <div className={styles.statsNote} style={{ marginTop: 4 }}>
              {demo ? `${demo.totalReelCount} Reels · median ${formatNumber(demo.medianViewCount)} views` : loading ? "Loading catalog" : "Catalog unavailable"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["outlier", "views", "engagement"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                style={{
                  border: `1px solid ${sortMode === mode ? "rgba(167,139,250,.7)" : "rgba(255,255,255,.12)"}`,
                  background: sortMode === mode ? "rgba(124,58,237,.16)" : "transparent",
                  color: sortMode === mode ? "#c4b5fd" : "#9f9fac",
                  borderRadius: 999,
                  padding: "7px 11px",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {mode === "outlier" ? "Outlier score" : mode}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "52px 18px", textAlign: "center", color: "#9f9fac" }}>Loading top Reels…</div>
        ) : error && !demo ? (
          <div style={{ padding: "42px 18px", textAlign: "center", color: "#a9a9b6" }}>
            The demo catalog is unavailable right now. The full research tool is still available in SpyReels.
          </div>
        ) : (
          <div className={styles.previewGrid}>
            {sortedReels.map((reel) => {
              const multiple = formatOutlier(outlierMultiple(reel.viewCount, demo?.medianViewCount ?? 0));
              return (
                <article className={styles.previewCard} key={reel.id}>
                  <div
                    className={styles.previewArt}
                    style={{
                      position: "relative",
                      backgroundImage: `linear-gradient(180deg, transparent 48%, rgba(0,0,0,.86)), url(${JSON.stringify(reel.thumbnailUrl).slice(1, -1)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    {multiple ? (
                      <span style={{ position: "absolute", top: 10, left: 10, borderRadius: 999, padding: "4px 7px", background: "rgba(0,0,0,.72)", color: "#a7f3d0", fontSize: 11, fontWeight: 700 }}>
                        {multiple}
                      </span>
                    ) : null}
                    <strong>{formatNumber(reel.viewCount)} views</strong>
                  </div>
                  <div className={styles.previewBody}>
                    <div className={styles.statsNote}>Hook · 0–3s</div>
                    <p style={{ color: "#f1f1f5", fontWeight: 650, marginTop: 7 }}>{hookPreview(reel.caption)}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                      <span className={styles.statsNote}>{reel.engagementRate > 0 ? `${reel.engagementRate.toFixed(1)}% eng.` : "eng. n/a"}</span>
                      <button type="button" onClick={() => handoffToResearch(demo?.handle ?? activeHandle)} style={{ border: 0, background: "transparent", color: "#a78bfa", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                        Remake →
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className={styles.previewFooter}>
          <span>Every Reel here can continue into SpyReels research and script creation.</span>
          <button className={styles.secondaryButton} type="button" onClick={() => handoffToResearch(demo?.handle ?? activeHandle)} style={{ padding: "10px 14px", background: "rgba(255,255,255,.055)", color: "white", border: "1px solid rgba(255,255,255,.12)" }}>
            See the full list free
          </button>
        </div>
      </section>
    </>
  );
}
