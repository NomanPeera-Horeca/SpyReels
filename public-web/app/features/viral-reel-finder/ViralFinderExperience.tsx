"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type FoundProfile = {
  found: true;
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isVerified: boolean;
  isPrivate: boolean;
  category: string;
};

type ProfilePayload = FoundProfile | { found: false; error?: string };

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

function handoffToResearch(handle: string) {
  try {
    sessionStorage.setItem("spyreels:research_pending_handle", handle);
    sessionStorage.setItem("spyreels:research_autostart", "1");
    sessionStorage.setItem("spyreels:research_pending_platform", "instagram");
  } catch {
    // Best-effort handoff. Production runs this page on the same spyreels.ai origin.
  }
  window.location.assign(`${appOrigin()}/research`);
}

export default function ViralFinderExperience() {
  const [input, setInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string>(DEMO_HANDLES[0]);
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("views");
  const [showAll, setShowAll] = useState(false);
  const [selectedReel, setSelectedReel] = useState<DemoReel | null>(null);

  const [debouncedHandle, setDebouncedHandle] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<FoundProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = normalizeHandle(input);
    setProfile(null);
    setProfileError(null);
    if (normalized.length < 2) {
      setDebouncedHandle("");
      return;
    }
    if (!validHandle(normalized)) {
      setProfileError("Instagram usernames can only contain letters, numbers, periods and underscores.");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedHandle(normalized), 700);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!debouncedHandle) return;
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(null);

    fetch(`/features/viral-reel-finder/profile?handle=${encodeURIComponent(debouncedHandle)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as ProfilePayload;
        if (!response.ok || body.found !== true) {
          throw new Error("error" in body && body.error ? body.error : "We could not find that Instagram account.");
        }
        return body;
      })
      .then((body) => setProfile(body))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setProfile(null);
        setProfileError(error instanceof Error ? error.message : "We could not find that Instagram account.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false);
      });

    return () => controller.abort();
  }, [debouncedHandle]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setDemoError(null);
    setSelectedReel(null);
    setShowAll(false);

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
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDemo(null);
        setDemoError(error instanceof Error ? error.message : "The demo catalog is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeHandle]);

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

  function chooseDemo(handle: string) {
    setInput(handle);
    setActiveHandle(handle);
    setTimeout(() => document.getElementById("live-demo")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = normalizeHandle(input);
    if (!handle || !validHandle(handle)) {
      setProfileError("Enter a valid Instagram username or profile link.");
      return;
    }
    if (DEMO_HANDLE_SET.has(handle)) {
      chooseDemo(handle);
      return;
    }
    handoffToResearch(profile?.username === handle ? profile.username : handle);
  }

  return (
    <div id="live-demo" className={styles.experience}>
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
          <button className={styles.primaryButton} type="submit">
            {profileLoading ? "Checking…" : profile ? `Research @${profile.username}` : "Find Viral Reels"}
          </button>
        </form>

        {profileLoading ? <div className={styles.profileLoading}>Looking up Instagram profile…</div> : null}
        {profileError && !profileLoading ? <p className={styles.formError}>{profileError}</p> : null}

        {profile ? (
          <button className={styles.profileCard} type="button" onClick={() => handoffToResearch(profile.username)}>
            <span className={styles.profileAvatarWrap}>
              {profile.profilePicUrl ? (
                <img className={styles.profileAvatar} src={profile.profilePicUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className={styles.profileAvatarFallback}>@</span>
              )}
            </span>
            <span className={styles.profileText}>
              <span className={styles.profileNameRow}>
                <strong>@{profile.username}</strong>
                {profile.isVerified ? <span className={styles.verified}>✓</span> : null}
                {profile.isPrivate ? <span className={styles.privateBadge}>Private</span> : null}
              </span>
              {profile.fullName ? <span>{profile.fullName}</span> : null}
              {profile.biography ? <span className={styles.profileBio}>{profile.biography}</span> : null}
              <span className={styles.profileStats}>
                <b>{formatNumber(profile.postCount)}</b> posts · <b>{formatNumber(profile.followerCount)}</b> followers · <b>{formatNumber(profile.followingCount)}</b> following
              </span>
            </span>
            <span className={styles.profileAction}>Research this account →</span>
          </button>
        ) : null}

        <div className={styles.tryRow}>
          <span>Try a live demo:</span>
          {DEMO_HANDLES.map((handle) => (
            <button type="button" onClick={() => chooseDemo(handle)} key={handle}>@{handle}</button>
          ))}
        </div>
      </div>

      <section className={styles.preview} aria-label="Live Viral Reel Finder product preview">
        <div className={styles.previewHeader}>
          <div>
            <small>Live product preview</small>
            <strong>@{demo?.handle ?? activeHandle}</strong>
            <span>{demo ? `${demo.totalReelCount} Reels available` : loading ? "Loading account" : "Account unavailable"}</span>
          </div>
          <div className={styles.sortTabs} aria-label="Sort demo Reels">
            <button className={sortMode === "views" ? styles.activeSort : undefined} type="button" onClick={() => setSortMode("views")}>Views</button>
            <button className={sortMode === "engagement" ? styles.activeSort : undefined} type="button" onClick={() => setSortMode("engagement")}>Engagement</button>
          </div>
        </div>

        {loading ? (
          <div className={styles.demoState}>Loading real Reel data…</div>
        ) : demoError || !demo ? (
          <div className={styles.demoState}>The live demo is unavailable right now.</div>
        ) : (
          <>
            <div className={styles.previewGrid}>
              {visibleReels.map((reel) => (
                <article className={styles.previewCard} key={reel.id}>
                  <button className={styles.reelSelect} type="button" onClick={() => setSelectedReel(reel)}>
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
                      <b>See what happens next →</b>
                    </div>
                  </button>
                </article>
              ))}
            </div>

            <div className={styles.previewFooter}>
              <button type="button" className={styles.textButton} onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Show fewer Reels" : `Show all ${Math.min(8, sortedReels.length)} demo Reels`}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => handoffToResearch(profile?.username ?? activeHandle)}>
                Research my own account
              </button>
            </div>
          </>
        )}
      </section>

      {selectedReel ? (
        <section className={styles.nextStepPanel} aria-label="What SpyReels does after Reel research">
          <div className={styles.nextStepMedia} style={{ backgroundImage: `url(${JSON.stringify(selectedReel.thumbnailUrl).slice(1, -1)})` }} />
          <div className={styles.nextStepCopy}>
            <small>What happens after you find a strong Reel</small>
            <h2>Turn the research into something you can actually create.</h2>
            <p>SpyReels keeps the Reel as research context, then lets you study the hook, transcribe it, and carry the useful idea into your own script workflow.</p>
            <div className={styles.nextStepChips}>
              <span>1. Study the hook</span>
              <span>2. Transcribe the Reel</span>
              <span>3. Build your own script</span>
            </div>
            <button type="button" className={styles.primaryButton} onClick={() => handoffToResearch(profile?.username ?? activeHandle)}>
              Continue in SpyReels
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
