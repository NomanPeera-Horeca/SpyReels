"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { InstagramMark } from "../../../../shared/ui/PlatformMarks";
import { researchReturnTo } from "../../../../shared/researchIntent";
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

function handoffToResearch(handle: string, source: "form" | "selected_reel") {
  const returnTo = researchReturnTo(handle);
  trackPublicWeb("viral_finder_research_cta_clicked", { handle, source });
  trackPublicWeb("viral_finder_app_handoff", {
    handle,
    source,
    return_to: returnTo,
    auth: "signup",
  });
  // Keep the visitor on the Finder while authenticating. The auth dialog
  // carries this exact destination into both email and Google completion.
  const url = new URL("/features/viral-reel-finder", window.location.origin);
  url.searchParams.set("auth", "signup");
  url.searchParams.set("returnTo", returnTo);
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
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("views");
  const [showAll, setShowAll] = useState(false);
  const [selectedReel, setSelectedReel] = useState<DemoReel | null>(null);
  const [showSpyReelsNext, setShowSpyReelsNext] = useState(false);

  const [debouncedHandle, setDebouncedHandle] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<FoundProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [finderReady, setFinderReady] = useState(false);

  useEffect(() => {
    setFinderReady(true);
  }, []);

  useEffect(() => {
    const normalized = normalizeHandle(input);
    setProfile(null);
    setProfileError(null);

    if (DEMO_HANDLE_SET.has(normalized)) {
      setDebouncedHandle("");
      setProfileLoading(false);
      setPreviewHandle(normalized);
      return;
    }

    setPreviewHandle(null);

    if (normalized.length < 2) {
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

    const input = encodeURIComponent(JSON.stringify({ json: { handle: debouncedHandle } }));
    // The public tRPC procedure already lives on the same Express host. Avoid
    // an extra Next -> app round trip through the 5-second page-render proxy.
    fetch(`/api/trpc/featured.publicProfilePreview?input=${input}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Instagram lookup is temporarily unavailable. Please try again.");
        }
        const envelope = (await response.json()) as {
          result?: { data?: { json?: ProfilePayload } };
          error?: { message?: string };
        };
        const body = envelope.result?.data?.json;
        if (!body) {
          throw new Error(envelope.error?.message || "Instagram lookup is temporarily unavailable. Please try again.");
        }
        if (!response.ok || body.found !== true) {
          throw new Error("error" in body && body.error ? body.error : "We could not find that Instagram account.");
        }
        return body;
      })
      .then((body) => {
        setProfile(body);
        trackPublicWeb("viral_finder_profile_searched", {
          handle: body.username,
          found: true,
          is_private: body.isPrivate,
        });
      })
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

    fetch(`/features/viral-reel-finder/demo?handle=${encodeURIComponent(previewHandle)}`, {
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
  }, [previewHandle]);

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
  const normalizedInput = normalizeHandle(input);
  const isDemoInput = DEMO_HANDLE_SET.has(normalizedInput);
  const matchingProfile =
    profile && profile.username.toLowerCase() === normalizedInput ? profile : null;
  const selectedOwner = demo?.handle ?? previewHandle ?? "";
  const continueHandle =
    matchingProfile && !isDemoInput && !matchingProfile.isPrivate
      ? matchingProfile.username
      : selectedOwner;
  const showPreview = Boolean(previewHandle);

  function chooseDemo(handle: string) {
    setInput(handle);
    setPreviewHandle(handle);
    trackPublicWeb("viral_finder_demo_handle_selected", { handle });
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
    const nativeValue = String(new FormData(event.currentTarget).get("handle") ?? "");
    const handle = normalizeHandle(nativeValue || input);
    if (handle !== input) {
      setInput(nativeValue || handle);
    }
    if (!handle || !validHandle(handle)) {
      setProfileError("Enter a valid Instagram username or profile link.");
      (event.currentTarget.elements.namedItem("handle") as HTMLInputElement | null)?.focus();
      return;
    }
    if (DEMO_HANDLE_SET.has(handle)) {
      chooseDemo(handle);
      return;
    }
    if (matchingProfile && !matchingProfile.isPrivate) {
      handoffToResearch(matchingProfile.username, "form");
      return;
    }
    requestProfileNow(handle);
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

  const submitLabel = matchingProfile?.isPrivate
    ? "Private account"
    : profileLoading
      ? "Checking…"
      : "Find viral Reels";
  const inputInvalid = Boolean(profileError && (!normalizedInput || !validHandle(normalizedInput)));

  return (
    <div id="live-demo" className={styles.experience}>
      <div className={styles.finderIsland}>
        <form
          className={styles.finderForm}
          onSubmit={submit}
          data-finder-ready={finderReady ? "true" : "false"}
          data-invalid={inputInvalid ? "true" : undefined}
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
            onChange={(event) => setInput(event.target.value)}
            placeholder="@username or instagram.com/username"
            autoComplete="off"
            aria-invalid={inputInvalid}
            aria-describedby={profileError && !profileLoading ? "viral-finder-error" : undefined}
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
        {profileError && !profileLoading ? <p id="viral-finder-error" className={styles.formError} role="alert">{profileError}</p> : null}

        {matchingProfile ? (
          <button
            type="button"
            className={styles.profileCard}
            data-testid="confirmed-instagram-profile"
            disabled={matchingProfile.isPrivate}
            onClick={() => handoffToResearch(matchingProfile.username, "form")}
            aria-label={`Continue with @${matchingProfile.username} in Creator Radar`}
          >
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
                <b>{formatNumber(matchingProfile.followerCount)}</b> followers · <b>{formatNumber(matchingProfile.followingCount)}</b> following
              </span>
            </span>
            <span className={styles.profileAction}>
              {matchingProfile.isPrivate ? "Private account" : "Continue →"}
            </span>
          </button>
        ) : null}

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
              <small>Interactive example</small>
              <strong>@{demo?.handle ?? previewHandle}</strong>
              <span>{demo ? `${demo.totalReelCount} Reels available` : loading ? "Loading account" : "Account unavailable"}</span>
            </div>
            <div className={styles.sortTabs} aria-label="Sort example Reels">
              <button className={sortMode === "views" ? styles.activeSort : undefined} type="button" aria-pressed={sortMode === "views"} onClick={() => changeSort("views")}>Views</button>
              <button className={sortMode === "engagement" ? styles.activeSort : undefined} type="button" aria-pressed={sortMode === "engagement"} onClick={() => changeSort("engagement")}>Engagement</button>
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
