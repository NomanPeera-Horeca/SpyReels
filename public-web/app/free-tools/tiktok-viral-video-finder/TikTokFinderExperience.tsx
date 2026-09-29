"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { TikTokMark } from "../../../../shared/ui/PlatformMarks";
import styles from "./page.module.css";

const examples = ["charlidamelio", "khaby.lame", "zachking", "mrbeast"] as const;
const featured = new Set<string>(examples);
type Video = { id: number; caption: string; thumbnailUrl: string | null; viewCount: number; engagementRate: number };
type Demo = { handle: string; medianViewCount: number; totalVideoCount: number; videos: Video[] };

function parseHandle(raw: string) {
  const match = raw.trim().match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([^/?#\s]+)/i);
  return (match ? match[1] : raw.trim()).replace(/^@/, "").toLowerCase();
}

function validHandle(handle: string) { return /^[a-z0-9._]{2,24}$/.test(handle); }
function prettyCount(value: number) { return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value); }

export default function TikTokFinderExperience() {
  const [input, setInput] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"outlier" | "views" | "engagement">("outlier");
  const sorted = useMemo(() => [...(demo?.videos ?? [])].sort((a, b) => {
    if (sort === "engagement") return b.engagementRate - a.engagementRate;
    return b.viewCount - a.viewCount;
  }), [demo, sort]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setDemo(null);
    fetch(`/free-tools/tiktok-viral-video-finder/demo?handle=${encodeURIComponent(active)}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.videos)) throw new Error(body.error || "Results are unavailable right now. Please try again.");
        return body as Demo;
      })
      .then(setDemo)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Results are unavailable right now."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active]);

  function continueToResearch(handle: string) {
    const returnTo = `/research?platform=tiktok&creator=${encodeURIComponent(handle)}&start=1`;
    const url = new URL("/free-tools/tiktok-viral-video-finder", window.location.origin);
    url.searchParams.set("auth", "signup");
    url.searchParams.set("returnTo", returnTo);
    window.location.assign(url.toString());
  }

  function submit(raw: string) {
    const handle = parseHandle(raw);
    if (!handle) { setError("Enter a TikTok username or profile link."); return; }
    if (!validHandle(handle)) { setError("Enter a valid TikTok username."); return; }
    setError(""); setInput(handle);
    if (featured.has(handle)) {
      if (handle === active && demo) document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      else setActive(handle);
    } else continueToResearch(handle);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); submit(input); }

  return <div id="finder" className={styles.experience}>
    <form className={styles.finderForm} data-invalid={Boolean(error)} onSubmit={onSubmit} noValidate>
      <TikTokMark className={styles.inputMark} />
      <label className={styles.srOnly} htmlFor="tiktok-handle">TikTok username or profile link</label>
      <input id="tiktok-handle" value={input} onChange={event => { setInput(event.target.value); setError(""); }} placeholder="TikTok username or profile link" autoComplete="off" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={error ? "tiktok-search-error" : undefined} />
      <button type="submit">Find viral TikToks <span aria-hidden>→</span></button>
    </form>
    {error && <p className={styles.error} id="tiktok-search-error" role="alert">{error}</p>}
    <p className={styles.examples}>Try {examples.map((handle, index) => <span key={handle}>{index > 0 ? " · " : ""}<button type="button" onClick={() => submit(handle)}>@{handle}</button></span>)}</p>
    {(loading || demo || (active && error)) && <section className={styles.results} id="results" aria-live="polite">
      {loading && <p className={styles.resultsStatus}>Loading public TikTok videos…</p>}
      {demo && <><div className={styles.resultsHeader}><div><small>Public video preview</small><h2>@{demo.handle}</h2><p>{prettyCount(demo.totalVideoCount)} public videos · compared with the creator’s usual views</p></div><label>Sort by <select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="outlier">Standout views</option><option value="views">Views</option><option value="engagement">Engagement</option></select></label></div>
        {sorted.length ? <div className={styles.videoGrid}>{sorted.slice(0, 8).map(video => <article key={video.id} className={styles.videoCard}>
          {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className={styles.emptyThumbnail} aria-hidden="true"><TikTokMark /></div>}
          <div><strong>{prettyCount(video.viewCount)} views</strong><p>{video.caption?.trim() || "Open this video in SpyReels to study its opening"}</p><small>{Number(video.engagementRate || 0).toFixed(1)}% engagement</small></div>
        </article>)}</div> : <p className={styles.resultsStatus}>No public videos are available for this preview right now.</p>}
        <button className={styles.continue} type="button" onClick={() => continueToResearch(demo.handle)}>Continue with @{demo.handle} in SpyReels <span aria-hidden>→</span></button>
      </>}
    </section>}
  </div>;
}
