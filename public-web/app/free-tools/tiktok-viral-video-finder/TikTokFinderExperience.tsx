"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { TikTokMark } from "../../../../shared/ui/PlatformMarks";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { FinderSearch } from "../../../components/FinderSearch";
import { FinderResultsPreview } from "../../../components/FinderResultsPreview";
import type { ResultCardData } from "../../../components/ResultCard";
import {
  formatFinderCount,
  type FinderProfilePreviewData,
} from "../../../components/FinderProfilePreview";
import {
  useFinderProfileLookup,
  type FinderProfileLookupResult,
} from "../../../components/useFinderProfileLookup";
import { trackPublicWeb } from "../../../lib/trackPublicWeb";
import styles from "./page.module.css";

const examples = ["charlidamelio", "khaby.lame", "zachking", "mrbeast"] as const;
const featured = new Set<string>(examples);

type Video = {
  id: number;
  caption: string;
  thumbnailUrl: string | null;
  viewCount: number;
  engagementRate: number;
};

type Demo = {
  handle: string;
  medianViewCount: number;
  totalVideoCount: number;
  videos: Video[];
};

type ProfilePayload = FinderProfileLookupResult | { found: false; error?: string };

function parseHandle(raw: string) {
  const match = raw
    .trim()
    .match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([^/?#\s]+)/i);
  return (match ? match[1] : raw.trim()).replace(/^@/, "").toLowerCase();
}

function validHandle(handle: string) {
  return /^[a-z0-9._]{2,24}$/.test(handle);
}

function isDemoHandle(handle: string) {
  return featured.has(handle);
}

function prettyCount(value: number) {
  return formatFinderCount(value);
}

async function fetchTikTokProfilePreview(
  handle: string,
  signal: AbortSignal
): Promise<FinderProfileLookupResult> {
  const input = encodeURIComponent(JSON.stringify({ json: { handle } }));
  const response = await fetch(
    `/api/trpc/tiktokScrape.publicProfilePreview?input=${input}`,
    {
      signal,
      headers: { accept: "application/json" },
    }
  );
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("TikTok lookup is temporarily unavailable. Please try again.");
  }
  const envelope = (await response.json()) as {
    result?: { data?: { json?: ProfilePayload } };
    error?: { message?: string };
  };
  const body = envelope.result?.data?.json;
  if (!body) {
    throw new Error(
      envelope.error?.message ||
        "TikTok lookup is temporarily unavailable. Please try again."
    );
  }
  if (!response.ok || body.found !== true) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : "We could not find that TikTok account."
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
        <b>{prettyCount(profile.followerCount)}</b> followers ·{" "}
        <b>{prettyCount(profile.postCount)}</b> videos
      </>
    ),
  };
}

export default function TikTokFinderExperience() {
  const [input, setInput] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoError, setDemoError] = useState("");

  const onProfileFound = useCallback((body: FinderProfileLookupResult) => {
    trackPublicWeb("viral_finder_profile_searched", {
      handle: body.username,
      found: true,
      is_private: body.isPrivate,
      platform: "tiktok",
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
    normalize: parseHandle,
    isValid: validHandle,
    invalidMessage:
      "TikTok usernames can only contain letters, numbers, periods and underscores.",
    isDemoHandle,
    fetchProfile: fetchTikTokProfilePreview,
    onProfileFound,
  });

  useEffect(() => {
    if (isDemoInput) {
      setActive(normalizedInput);
      return;
    }
    setActive(null);
  }, [isDemoInput, normalizedInput]);

  useEffect(() => {
    if (!active) {
      setDemo(null);
      setDemoError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setDemoError("");
    setDemo(null);

    fetch(
      `/free-tools/tiktok-viral-video-finder/demo?handle=${encodeURIComponent(active)}`,
      { signal: controller.signal, headers: { accept: "application/json" } }
    )
      .then(async (response) => {
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Results are unavailable right now. Please try again.");
        }
        const body = await response.json();
        if (!response.ok || !body || !Array.isArray(body.videos)) {
          throw new Error(
            body?.error || "Results are unavailable right now. Please try again."
          );
        }
        return body as Demo;
      })
      .then(setDemo)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setDemoError(
            cause instanceof Error && cause.message !== "Failed to fetch"
              ? cause.message
              : "Results are unavailable right now. Please try again."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [active]);

  const visibleVideos = useMemo(
    () =>
      [...(demo?.videos ?? [])]
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 4),
    [demo]
  );

  const resultCards = useMemo<ResultCardData[]>(
    () =>
      visibleVideos.map((video) => ({
        id: video.id,
        caption: video.caption,
        thumbnailUrl: video.thumbnailUrl,
        viewCount: video.viewCount,
        engagementRate: video.engagementRate,
        creatorHandle: demo?.handle ?? active,
      })),
    [visibleVideos, demo?.handle, active]
  );

  function continueToResearch(handle: string, source: "form" | "selected_reel" = "form") {
    const returnTo = `/research?platform=tiktok&creator=${encodeURIComponent(handle)}&start=1`;
    trackPublicWeb("viral_finder_research_cta_clicked", {
      handle,
      source,
      platform: "tiktok",
    });
    trackPublicWeb("viral_finder_app_handoff", {
      handle,
      source,
      return_to: returnTo,
      auth: "signup",
      platform: "tiktok",
    });
    const url = new URL("/free-tools/tiktok-viral-video-finder", window.location.origin);
    url.searchParams.set("auth", "signup");
    url.searchParams.set("returnTo", returnTo);
    window.location.assign(url.toString());
  }

  function chooseDemo(handle: string) {
    setInput(handle);
    setActive(handle);
    trackPublicWeb("viral_finder_demo_handle_selected", {
      handle,
      platform: "tiktok",
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = parseHandle(input);
    if (!handle || !validHandle(handle)) {
      setProfileError("Enter a valid TikTok username or profile link.");
      return;
    }
    if (featured.has(handle)) {
      chooseDemo(handle);
      return;
    }
    if (matchingProfile && !matchingProfile.isPrivate) {
      continueToResearch(matchingProfile.username);
      return;
    }
    requestProfileNow(handle);
  }

  function remakeResult(result: ResultCardData) {
    const handle = demo?.handle ?? active ?? "";
    trackPublicWeb("viral_finder_reel_selected", {
      handle,
      reel_id: result.id,
      source: "remake",
      platform: "tiktok",
    });
    continueToResearch(handle, "selected_reel");
  }

  const submitLabel = matchingProfile?.isPrivate
    ? "Private account"
    : profileLoading
      ? "Checking…"
      : "Find viral TikToks";
  const inputInvalid = Boolean(
    profileError && (!normalizedInput || !validHandle(normalizedInput))
  );

  return (
    <div id="finder" className={styles.experience}>
      <div className={styles.finderIsland}>
        <FinderSearch
          invalid={inputInvalid}
          onSubmit={onSubmit}
          noValidate
          platformMark={<TikTokMark />}
          label="TikTok username or profile link"
          inputId="tiktok-handle"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="TikTok username or profile link"
          inputProps={{
            autoComplete: "off",
            spellCheck: false,
            "aria-describedby":
              profileError && !profileLoading ? "tiktok-search-error" : undefined,
          }}
          action={
            <PrimaryButton
              type="submit"
              disabled={profileLoading || Boolean(matchingProfile?.isPrivate)}
            >
              {submitLabel}{" "}
              {matchingProfile?.isPrivate || profileLoading ? null : (
                <span aria-hidden>→</span>
              )}
            </PrimaryButton>
          }
          profileLoading={profileLoading}
          profileLoadingLabel="Looking up TikTok profile…"
          profileError={profileError}
          profileErrorId="tiktok-search-error"
          profile={matchingProfile ? toPreviewData(matchingProfile) : null}
          profileTestId="confirmed-tiktok-profile"
          profileContinueAriaLabel={(username) =>
            `Continue with @${username} in SpyReels`
          }
          onProfileContinue={continueToResearch}
        >
          <p className={styles.examples}>
            Try{" "}
            {examples.map((handle, index) => (
              <span key={handle}>
                {index > 0 ? " · " : ""}
                <button
                  type="button"
                  aria-pressed={active === handle}
                  onClick={() => chooseDemo(handle)}
                >
                  @{handle}
                </button>
              </span>
            ))}
          </p>
        </FinderSearch>
      </div>

      {active ? (
        <FinderResultsPreview
          id="results"
          handle={demo?.handle ?? active}
          results={resultCards}
          platformLabel="TikTok"
          platformMark={<TikTokMark />}
          loading={loading}
          error={demoError || null}
          onRemake={remakeResult}
        />
      ) : null}
    </div>
  );
}
