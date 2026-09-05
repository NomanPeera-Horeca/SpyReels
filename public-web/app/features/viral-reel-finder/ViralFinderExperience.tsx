"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { InstagramMark } from "../../../../shared/ui/PlatformMarks";
import interactionStyles from "./interaction.module.css";
import styles from "./page.module.css";

const DEMO_HANDLES = ["garyvee", "humphreytalks", "russellbrunson", "codiesanchez"] as const;
const DEMO_HANDLE_SET = new Set<string>(DEMO_HANDLES);

type SortMode = "views" | "engagement";
type PreviewStep = "hook" | "transcript" | "create";

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
  return cleaned.length > 110 ? `${cleaned.slice(0, 107)}...` : cleaned;
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
  const url = new URL(`${appOrigin()}/`);
  url.searchParams.set("auth", "signup");
  url.searchParams.set("returnTo", "/research");
  url.searchParams.set("researchHandle", handle);
  window.location.assign(url.toString());
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
  const [previewStep, setPreviewStep] = useState<PreviewStep>("hook");

  const [debouncedHandle, setDebouncedHandle] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<FoundProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = normalizeHandle(input);
    setProfile(null);
    setProfileError(null);

    if (normalized.length < 2 || DEMO_HANDLE_SET.has(normalized)) {
      setDebouncedHandle("");
      setProfileLoading(false);
      return;
    }
    if (!validHandle(normalized)) {
      setDebouncedHandle("");
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
    setPreviewStep("hook");

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
  const normalizedInput = normalizeHandle(input);
  const isDemoInput = DEMO_HANDLE_SET.has(normalizedInput);
  const matchingProfile =
    profile && profile.username.toLowerCase() === normalizedInput ? profile : null;
  const selectedOwner = demo?.handle ?? activeHandle;

  function chooseDemo(handle: string) {
    setInput(handle);
    setActiveHandle(handle);
    window.requestAnimationFrame(() => {
      document.getElementById("live-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function requestProfileNow(handle: string) {
    setProfile(null);
    setProfileError(null);
    setProfileLoading(true);
    setDebouncedHandle("");
    window.setTimeout(() => setDebouncedHandle(handle), 0);
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
    if (!matchingProfile) {
      requestProfileNow(handle);
      return;
    }
    if (matchingProfile.isPrivate) {
      setProfileError("SpyReels can research public Instagram accounts. This account is private.");
      return;
    }
    handoffToResearch(matchingProfile.username);
  }

  function selectReel(reel: DemoReel) {
    setSelectedReel(reel);
    setPreviewStep("hook");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("selected-reel-next")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  const submitLabel = isDemoInput
    ? `View @${normalizedInput} Reels`
    : matchingProfile?.isPrivate
      ? "Private account"
      : matchingProfile
        ? `Research @${matchingProfile.username}`
        : profileLoading
          ? "Checking…"
          : "Find account";

  return (
    <div id="live-demo" className={styles.experience}>
      <div className={styles.finderIsland}>
        <form className={styles.finderForm} onSubmit={submit}>
          <span className={styles.platformMark} aria-hidden>
            <InstagramMark />
          </span>
          <label className={styles.srOnly} htmlFor="viral-finder-handle">Instagram username or profile link</label>
          <input
            id="viral-finder-handle"
            className={styles.finderInput}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="@username or instagram.com/username"
            autoComplete="off"
          />
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={profileLoading || Boolean(matchingProfile?.isPrivate)}
          >
            {submitLabel}
          </button>
        </form>

        {profileLoading ? <div className={styles.profileLoading}>Looking up Instagram profile…</div> : null}
        {profileError && !profileLoading ? <p className={styles.formError}>{profileError}</p> : null}

        {matchingProfile ? (
          <article className={`${styles.profileCard} ${interactionStyles.profileConfirmed}`}>
            <span className={styles.profileAvatarWrap}>
              {matchingProfile.profilePicUrl ? (
                <img className={styles.profileAvatar} src={matchingProfile.profilePicUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className={styles.profileAvatarFallback}>@</span>
              )}
            </span>
            <span className={styles.profileText}>
              <span className={styles.profileNameRow}>
                <strong>@{matchingProfile.username}</strong>
                {matchingProfile.isVerified ? <span className={styles.verified}>✓</span> : null}
                {matchingProfile.isPrivate ? <span className={styles.privateBadge}>Private</span> : null}
              </span>
              {matchingProfile.fullName ? <span>{matchingProfile.fullName}</span> : null}
              {matchingProfile.biography ? <span className={styles.profileBio}>{matchingProfile.biography}</span> : null}
              <span className={styles.profileStats}>
                <b>{formatNumber(matchingProfile.postCount)}</b> posts · <b>{formatNumber(matchingProfile.followerCount)}</b> followers · <b>{formatNumber(matchingProfile.followingCount)}</b> following
              </span>
            </span>
            <span className={interactionStyles.profilePlatform}>
              <InstagramMark /> Instagram profile
            </span>
          </article>
        ) : null}

        <div className={styles.tryRow}>
          <span>Try the interactive example:</span>
          {DEMO_HANDLES.map((handle) => (
            <button type="button" onClick={() => chooseDemo(handle)} key={handle}>@{handle}</button>
          ))}
        </div>
      </div>

      <section className={styles.preview} aria-label="Interactive Viral Reel Finder product example">
        <div className={styles.previewHeader}>
          <div>
            <small>Interactive example</small>
            <strong>@{demo?.handle ?? activeHandle}</strong>
            <span>{demo ? `${demo.totalReelCount} Reels available` : loading ? "Loading account" : "Account unavailable"}</span>
          </div>
          <div className={styles.sortTabs} aria-label="Sort example Reels">
            <button className={sortMode === "views" ? styles.activeSort : undefined} type="button" onClick={() => setSortMode("views")}>Views</button>
            <button className={sortMode === "engagement" ? styles.activeSort : undefined} type="button" onClick={() => setSortMode("engagement")}>Engagement</button>
          </div>
        </div>

        {loading ? (
          <div className={styles.demoState}>Loading Reel data…</div>
        ) : demoError || !demo ? (
          <div className={styles.demoState}>The interactive example is unavailable right now.</div>
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
                        <b>{selected ? "Selected — explore below ↓" : "See what SpyReels does next →"}</b>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>

            {sortedReels.length > 4 ? (
              <div className={`${styles.previewFooter} ${interactionStyles.previewFooterSingle}`}>
                <button type="button" className={styles.textButton} onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Show fewer Reels" : `Show all ${Math.min(8, sortedReels.length)} Reels`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {selectedReel ? (
        <section id="selected-reel-next" className={styles.nextStepPanel} aria-label="What SpyReels does after Reel research">
          <div className={styles.nextStepMedia} style={{ backgroundImage: `url(${JSON.stringify(selectedReel.thumbnailUrl).slice(1, -1)})` }} />
          <div className={styles.nextStepCopy}>
            <small>What happens after you choose a Reel</small>
            <h2>See the path before you sign in.</h2>
            <p>SpyReels keeps this Reel as research context and gives you a clear path from the original post to your own content workflow.</p>

            <div className={interactionStyles.stepTabs} aria-label="Preview the SpyReels workflow">
              {([
                ["hook", "1. Hook"],
                ["transcript", "2. Transcript"],
                ["create", "3. Create"],
              ] as const).map(([step, label]) => (
                <button
                  key={step}
                  type="button"
                  className={`${interactionStyles.stepTab} ${previewStep === step ? interactionStyles.stepTabActive : ""}`}
                  onClick={() => setPreviewStep(step)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={interactionStyles.stepDetail}>
              {previewStep === "hook" ? (
                <>
                  <small>Start with the actual Reel</small>
                  <strong>{hookPreview(selectedReel.caption)}</strong>
                  <p>Keep the source visible while you study the opening, topic and structure that made you stop.</p>
                </>
              ) : previewStep === "transcript" ? (
                <>
                  <small>Next inside SpyReels</small>
                  <strong>Turn the Reel into text you can inspect.</strong>
                  <p>SpyReels can transcribe the Reel so the spoken content becomes research context you can read, study and carry forward.</p>
                </>
              ) : (
                <>
                  <small>Then make it yours</small>
                  <strong>Use the research as context for an original script.</strong>
                  <p>Move the useful idea into your own script workflow, choose your angle and develop a version for your audience instead of copying the original.</p>
                </>
              )}
            </div>

            <button type="button" className={styles.primaryButton} onClick={() => handoffToResearch(selectedOwner)}>
              Research @{selectedOwner} in SpyReels
            </button>
            <span className={interactionStyles.actionHint}>Opens Research with @{selectedOwner} selected.</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
