"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { InstagramMark } from "../../../../shared/ui/PlatformMarks";
import { researchReturnTo } from "../../../../shared/researchIntent";
import { trackPublicWeb } from "../../../lib/trackPublicWeb";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { FinderSearch } from "../../../components/FinderSearch";
import {
  formatFinderCount,
  type FinderProfilePreviewData,
} from "../../../components/FinderProfilePreview";
import {
  useFinderProfileLookup,
  type FinderProfileLookupResult,
} from "../../../components/useFinderProfileLookup";
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

type ProfilePayload = FinderProfileLookupResult | { found: false; error?: string };

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").toLowerCase();
}

function validHandle(handle: string): boolean {
  return /^[a-z0-9._]{1,30}$/i.test(handle);
}

function isDemoHandle(handle: string): boolean {
  return DEMO_HANDLE_SET.has(handle);
}

function formatNumber(value: number): string {
  return formatFinderCount(value);
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

async function fetchInstagramProfile(
  handle: string,
  signal: AbortSignal
): Promise<FinderProfileLookupResult> {
  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const response = await fetch(`/api/trpc/featured.publicProfilePreview?input=${input}`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Instagram lookup is temporarily unavailable. Please try again.");
  }
  const envelope = (await response.json()) as {
    result?: { data?: { json?: ProfilePayload } };
    error?: { message?: string };
  };
  const body = envelope.result?.data?.json;
  if (!body) {
    throw new Error(
      envelope.error?.message ||
        "Instagram lookup is temporarily unavailable. Please try again."
    );
  }
  if (!response.ok || body.found !== true) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : "We could not find that Instagram account."
    );
  }
  return body;
}

function toPreviewData(profile: FinderProfileLookupResult): FinderProfilePreviewData {
  return {
    username: profile.username,
    displayName: profile.fullName || undefined,
    biography: profile.biography || undefined,
    profilePicUrl: profile.profilePicUrl || undefined,
    isVerified: profile.isVerified,
    isPrivate: profile.isPrivate,
    meta: (
      <>
        <b>{formatNumber(profile.followerCount)}</b> followers ·{" "}
        <b>{formatNumber(profile.followingCount)}</b> following
      </>
    ),
  };
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
  const [finderReady, setFinderReady] = useState(false);

  const onProfileFound = useCallback((body: FinderProfileLookupResult) => {
    trackPublicWeb("viral_finder_profile_searched", {
      handle: body.username,
      found: true,
      is_private: body.isPrivate,
      platform: "instagram",
    });
  }, []);

  const {
    normalizedInput,
    isDemoInput,
    matchingProfile,
    profileLoading,
    profileError,
    setProfileError,
    requestProfileNow,
  } = useFinderProfileLookup({
    input,
    normalize: normalizeHandle,
    isValid: validHandle,
    invalidMessage:
      "Instagram usernames can only contain letters, numbers, periods and underscores.",
    isDemoHandle,
    fetchProfile: fetchInstagramProfile,
    onProfileFound,
  });

  useEffect(() => {
    setFinderReady(true);
  }, []);

  useEffect(() => {
    if (isDemoInput) {
      setPreviewHandle(normalizedInput);
      return;
    }
    setPreviewHandle(null);
  }, [isDemoInput, normalizedInput]);

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
  const selectedOwner = demo?.handle ?? previewHandle ?? "";
  const continueHandle =
    matchingProfile && !isDemoInput && !matchingProfile.isPrivate
      ? matchingProfile.username
      : selectedOwner;
  const showPreview = Boolean(previewHandle);

  function chooseDemo(handle: string) {
    setInput(handle);
    setPreviewHandle(handle);
    trackPublicWeb("viral_finder_demo_handle_selected", { handle, platform: "instagram" });
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
        <FinderSearch
          invalid={inputInvalid}
          onSubmit={submit}
          formProps={{
            "data-finder-ready": finderReady ? "true" : "false",
          }}
          platformMark={<InstagramMark />}
          label="Instagram username or profile link"
          inputId="viral-finder-handle"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="@username"
          inputProps={{
            name: "handle",
            autoComplete: "off",
            "aria-describedby":
              profileError && !profileLoading ? "viral-finder-error" : undefined,
          }}
          action={
            <PrimaryButton
              type="submit"
              glow
              disabled={profileLoading || Boolean(matchingProfile?.isPrivate)}
            >
              {submitLabel}
            </PrimaryButton>
          }
          profileLoading={profileLoading}
          profileLoadingLabel="Looking up Instagram profile…"
          profileError={profileError}
          profileErrorId="viral-finder-error"
          profile={matchingProfile ? toPreviewData(matchingProfile) : null}
          profileTestId="confirmed-instagram-profile"
          profileContinueAriaLabel={(username) =>
            `Continue with @${username} in Creator Radar`
          }
          onProfileContinue={(username) => handoffToResearch(username, "form")}
        >
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
        </FinderSearch>
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
                <PrimaryButton
                  type="button"
                  className={styles.nextStepPrimary}
                  glow
                  onClick={() => handoffToResearch(continueHandle, "selected_reel")}
                >
                  {continueHandle && continueHandle !== selectedOwner
                    ? `Research @${continueHandle} in SpyReels`
                    : `Continue @${selectedOwner} in SpyReels`}
                </PrimaryButton>
                <span className={interactionStyles.actionHint}>Opens Research with @{continueHandle} selected.</span>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
