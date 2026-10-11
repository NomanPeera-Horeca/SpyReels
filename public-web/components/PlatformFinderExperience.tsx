"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { InstagramMark, TikTokMark, YouTubeMark } from "../../shared/ui/PlatformMarks";
import { openHomepageAuth } from "../lib/openHomepageAuth";
import { trackPublicWeb } from "../lib/trackPublicWeb";
import { PrimaryButton } from "./PrimaryButton";
import { FinderSearch } from "./FinderSearch";
import { FinderResultsPreview } from "./FinderResultsPreview";
import type { ResultCardData } from "./ResultCard";
import {
  formatFinderCount,
  type FinderProfilePreviewData,
} from "./FinderProfilePreview";
import {
  useFinderProfileLookup,
  type FinderProfileLookupResult,
} from "./useFinderProfileLookup";
import { instagramFinderConfig } from "../lib/finderConfigs/instagram";
import { tiktokFinderConfig } from "../lib/finderConfigs/tiktok";
import { youtubeFinderConfig } from "../lib/finderConfigs/youtube";
import type { FinderConfig, FinderPlatform } from "../lib/finderConfigs/types";

type StyleMap = {
  readonly experience: string;
  readonly finderIsland: string;
  readonly tryRow: string;
  readonly examples: string;
  readonly demoHandleActive: string;
};

const CONFIG_BY_PLATFORM: Record<FinderPlatform, FinderConfig> = {
  instagram: instagramFinderConfig,
  tiktok: tiktokFinderConfig,
  youtube: youtubeFinderConfig,
};

function platformMark(platform: FinderPlatform) {
  if (platform === "instagram") return InstagramMark;
  if (platform === "tiktok") return TikTokMark;
  return YouTubeMark;
}

function isCatalogDemoPlatform(platform: FinderPlatform) {
  return platform === "tiktok" || platform === "youtube";
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

function toPreviewData(
  profile: FinderProfileLookupResult,
  metaKind: FinderConfig["search"]["profileMetaKind"]
): FinderProfilePreviewData {
  const pretty = formatFinderCount;
  return {
    username: profile.username,
    displayName: profile.fullName || undefined,
    biography: profile.biography || undefined,
    profilePicUrl: profile.profilePicUrl || undefined,
    isVerified: profile.isVerified,
    isPrivate: profile.isPrivate,
    meta:
      metaKind === "followersFollowing" ? (
        <>
          <b>{pretty(profile.followerCount)}</b> followers ·{" "}
          <b>{pretty(profile.followingCount)}</b> following
        </>
      ) : (
        <>
          <b>{pretty(profile.followerCount)}</b> followers ·{" "}
          <b>{pretty(profile.postCount)}</b> videos
        </>
      ),
  };
}

export function PlatformFinderExperience({
  platform,
  styles,
}: {
  platform: FinderPlatform;
  styles: StyleMap;
}) {
  const config = CONFIG_BY_PLATFORM[platform];
  const { search, pagePath, experienceId, resultsId } = config;
  const demoHandleSet = useMemo(() => new Set(search.demoHandles), [search.demoHandles]);
  const PlatformMark = platformMark(platform);

  const [input, setInput] = useState("");
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [demoHandle, setDemoHandle] = useState("");
  const [demoItems, setDemoItems] = useState<ResultCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [finderReady, setFinderReady] = useState(false);

  const onProfileFound = useCallback(
    (body: FinderProfileLookupResult) => {
      trackPublicWeb("viral_finder_profile_searched", {
        handle: body.username,
        found: true,
        is_private: body.isPrivate,
        platform,
      });
    },
    [platform]
  );

  const isDemoHandle = useCallback(
    (handle: string) => demoHandleSet.has(handle),
    [demoHandleSet]
  );

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
    normalize: search.normalizeHandle,
    isValid: search.validHandle,
    invalidMessage: search.invalidHandleMessage,
    isDemoHandle,
    fetchProfile: search.fetchProfile,
    onProfileFound,
  });

  useEffect(() => {
    if (search.dataFinderReady) setFinderReady(true);
  }, [search.dataFinderReady]);

  useEffect(() => {
    if (isDemoInput) {
      setActiveHandle(normalizedInput);
      return;
    }
    setActiveHandle(null);
  }, [isDemoInput, normalizedInput]);

  useEffect(() => {
    if (!activeHandle) {
      setDemoHandle("");
      setDemoItems([]);
      setDemoError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setDemoError(null);
    if (isCatalogDemoPlatform(platform)) {
      setDemoHandle("");
      setDemoItems([]);
    }

    fetch(search.demoUrl(activeHandle), {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (
          isCatalogDemoPlatform(platform) &&
          !response.headers.get("content-type")?.includes("application/json")
        ) {
          throw new Error(search.demoUnavailableMessage);
        }
        const body = await response.json();
        return search.parseDemoPayload(body, response.ok);
      })
      .then((parsed) => {
        setDemoHandle(parsed.handle);
        setDemoItems(
          parsed.items.map((item) => ({
            id: item.id,
            caption: item.caption,
            thumbnailUrl: item.thumbnailUrl,
            viewCount: item.viewCount,
            engagementRate: item.engagementRate,
            creatorHandle: parsed.handle || activeHandle,
          }))
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDemoHandle("");
        setDemoItems([]);
        if (isCatalogDemoPlatform(platform)) {
          setDemoError(
            error instanceof Error && error.message !== "Failed to fetch"
              ? error.message
              : search.demoUnavailableMessage
          );
        } else {
          setDemoError(
            error instanceof Error ? error.message : search.demoUnavailableMessage
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeHandle, platform, search]);

  useEffect(() => {
    if (!search.revealResultsOnLoad || !activeHandle || loading) return;
    window.requestAnimationFrame(() => revealIfNeeded(resultsId));
  }, [activeHandle, loading, demoItems, search.revealResultsOnLoad, resultsId]);

  const resultCards = useMemo<ResultCardData[]>(
    () =>
      [...demoItems]
        .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
        .slice(0, 4)
        .map((item) => ({
          ...item,
          creatorHandle: demoHandle || activeHandle || item.creatorHandle,
        })),
    [demoItems, demoHandle, activeHandle]
  );

  function handoff(handle: string, source: "form" | "selected_reel") {
    const returnTo = search.buildReturnTo(handle);
    const platformProp = { platform };
    trackPublicWeb("viral_finder_research_cta_clicked", {
      handle,
      source,
      ...platformProp,
    });
    trackPublicWeb("cta_clicked", {
      placement: "search",
      handle,
      source,
      ...platformProp,
    });
    trackPublicWeb("viral_finder_app_handoff", {
      handle,
      source,
      return_to: returnTo,
      auth: "signup",
      ...platformProp,
    });
    openHomepageAuth({ mode: "signup", returnTo });
  }

  function chooseDemo(handle: string) {
    setInput(handle);
    setActiveHandle(handle);
    trackPublicWeb("viral_finder_demo_handle_selected", { handle, platform });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let handle: string;
    if (platform === "instagram") {
      const nativeValue = String(new FormData(event.currentTarget).get("handle") ?? "");
      handle = search.normalizeHandle(nativeValue || input);
      if (handle !== input) setInput(nativeValue || handle);
    } else {
      handle = search.normalizeHandle(input);
    }

    if (!handle || !search.validHandle(handle)) {
      setProfileError(search.emptyHandleMessage);
      if (platform === "instagram") {
        (
          event.currentTarget.elements.namedItem("handle") as HTMLInputElement | null
        )?.focus();
      }
      return;
    }
    if (demoHandleSet.has(handle)) {
      chooseDemo(handle);
      return;
    }
    // YouTube Vite parity: non-demo handles go straight to research handoff.
    if (platform === "youtube") {
      handoff(handle, "form");
      return;
    }
    if (matchingProfile && !matchingProfile.isPrivate) {
      handoff(matchingProfile.username, "form");
      return;
    }
    requestProfileNow(handle);
  }

  function remakeResult(result: ResultCardData) {
    const handle = demoHandle || activeHandle || "";
    trackPublicWeb("viral_finder_reel_selected", {
      handle,
      reel_id: result.id,
      source: "remake",
      ...(platform === "instagram" ? {} : { platform }),
    });
    handoff(handle, "selected_reel");
  }

  const submitLabel = matchingProfile?.isPrivate
    ? "Private account"
    : profileLoading
      ? "Checking…"
      : search.submitLabel;
  const inputInvalid = Boolean(
    profileError && (!normalizedInput || !search.validHandle(normalizedInput))
  );
  const showPreview = Boolean(activeHandle);

  const examples =
    search.examplesVariant === "tryRow" ? (
      <div className={styles.tryRow}>
        <span>{search.examplesPrefix}</span>
        {search.demoHandles.map((handle) => (
          <button
            type="button"
            className={activeHandle === handle ? styles.demoHandleActive : undefined}
            aria-pressed={activeHandle === handle}
            onClick={() => chooseDemo(handle)}
            key={handle}
          >
            @{handle}
          </button>
        ))}
      </div>
    ) : (
      <p className={styles.examples}>
        {search.examplesPrefix}
        {search.demoHandles.map((handle, index) => (
          <span key={handle}>
            {index > 0 ? " · " : ""}
            <button
              type="button"
              aria-pressed={activeHandle === handle}
              onClick={() => chooseDemo(handle)}
            >
              @{handle}
            </button>
          </span>
        ))}
      </p>
    );

  return (
    <div id={experienceId} className={styles.experience}>
      <div className={styles.finderIsland}>
        <FinderSearch
          invalid={inputInvalid}
          onSubmit={submit}
          noValidate={search.noValidate}
          formProps={
            search.dataFinderReady
              ? { "data-finder-ready": finderReady ? "true" : "false" }
              : undefined
          }
          platform={platform}
          platformMark={<PlatformMark />}
          label={search.label}
          inputId={search.inputId}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={search.placeholder}
          inputProps={{
            ...(search.inputName ? { name: search.inputName } : {}),
            autoComplete: "off",
            ...(search.spellCheck === false ? { spellCheck: false } : {}),
            "aria-describedby":
              profileError && !profileLoading ? search.profileErrorId : undefined,
          }}
          action={
            <PrimaryButton
              type="submit"
              size="large"
              data-marketing-primary-button="finder-search"
              disabled={profileLoading || Boolean(matchingProfile?.isPrivate)}
            >
              {submitLabel}
            </PrimaryButton>
          }
          profileLoading={profileLoading}
          profileLoadingLabel={search.profileLoadingLabel}
          profileError={profileError}
          profileErrorId={search.profileErrorId}
          profile={
            matchingProfile
              ? toPreviewData(matchingProfile, search.profileMetaKind)
              : null
          }
          profileTestId={search.profileTestId}
          profileContinueAriaLabel={search.profileContinueAriaLabel}
          onProfileContinue={(username) => handoff(username, "form")}
        >
          {examples}
        </FinderSearch>
      </div>

      {showPreview ? (
        <FinderResultsPreview
          id={resultsId}
          handle={demoHandle || activeHandle || ""}
          results={resultCards}
          platformLabel={search.platformLabel}
          platformMark={<PlatformMark />}
          loading={loading}
          error={demoError}
          onRemake={remakeResult}
        />
      ) : null}
    </div>
  );
}
