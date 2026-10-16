/**
 * DEV ONLY (routed only when import.meta.env.DEV). Renders each onboarding
 * v2 screen with clearly fake fixture data for visual QA against Figma.
 * Usage: /dev/onboarding-v2?screen=platform|profile|use_case|attribution|niche
 *        &platform=instagram|tiktok|youtube &error=not_found &selected=1
 */
import { useState } from "react";
import { useSearch } from "wouter";
import "@/design-system/tokens.css";
import type {
  AttributionSource,
  PrimaryUseCase,
  SocialPlatform,
} from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import {
  AnalysisPreview,
  ProfileMobilePreview,
  ProfilePhonePreview,
  ViralStackPreview,
  type AnalysisView,
} from "@/components/onboarding-v2/previews";
import {
  AttributionStep,
  GrowthNicheStep,
  PlatformStep,
  ProfileStep,
  UseCaseStep,
  type PlatformError,
} from "@/components/onboarding-v2/steps";

const FAKE: PublicProfilePreview = {
  platform: "instagram",
  handle: "sample.creator",
  displayName: "Sample Creator",
  bio: "Fixture profile for visual QA\nNot a real account",
  category: "Creator",
  externalUrl: "https://example.com/sample",
  avatarUrl: null,
  bannerUrl: null,
  isVerified: false,
  isPrivate: false,
  postCount: 120,
  followerCount: 4200,
  followingCount: 180,
  likeCount: null,
  videoCount: null,
  recentPosts: [],
};

const RUNNING: AnalysisView = {
  status: "running",
  stages: {
    published_content: "done",
    strongest_performers: "done",
    hooks_and_topics: "running",
    niche_opportunities: "waiting",
  },
};

export default function DevOnboardingV2Preview() {
  const params = new URLSearchParams(useSearch());
  const screen = params.get("screen") ?? "platform";
  const platform = (params.get("platform") ?? "instagram") as SocialPlatform;
  const error = (params.get("error") as PlatformError | null) ?? null;
  const preselect = params.get("selected") === "1";
  const profile = { ...FAKE, platform };
  const [useCase, setUseCase] = useState<PrimaryUseCase | null>(
    preselect ? "find_viral_videos" : null
  );
  const [source, setSource] = useState<AttributionSource | null>(
    preselect ? "google_search" : null
  );
  const [niche, setNiche] = useState<string | null>(preselect ? "fitness" : null);
  const [p, setP] = useState<SocialPlatform | null>(platform);
  const [handle, setHandle] = useState(preselect || error ? "@sample.creator" : "");
  const noop = () => undefined;
  const analysis = (
    <AnalysisPreview
      displayName={profile.displayName}
      handle={profile.handle}
      avatarUrl={null}
      analysis={RUNNING}
    />
  );

  switch (screen) {
    case "profile":
      return (
        <ProfileStep
          profile={profile}
          busy={false}
          preview={<ProfilePhonePreview profile={profile} />}
          mobilePreview={<ProfileMobilePreview profile={profile} />}
          onBack={noop}
          onNotMe={noop}
          onConfirm={noop}
        />
      );
    case "use_case":
      return (
        <UseCaseStep
          handle={profile.handle}
          runStatus="running"
          value={useCase}
          busy={false}
          preview={analysis}
          onChange={setUseCase}
          onBack={noop}
          onContinue={noop}
        />
      );
    case "attribution":
      return (
        <AttributionStep
          handle={profile.handle}
          runStatus="running"
          value={source}
          busy={false}
          preview={analysis}
          onChange={setSource}
          onBack={noop}
          onSkip={noop}
          onContinue={noop}
        />
      );
    case "niche":
      return (
        <GrowthNicheStep
          value={niche}
          busy={false}
          preview={<ViralStackPreview />}
          onChange={setNiche}
          onBack={noop}
          onContinue={noop}
        />
      );
    default:
      return (
        <PlatformStep
          platform={p}
          handleInput={handle}
          error={error}
          busy={false}
          preview={<ViralStackPreview />}
          onPlatform={setP}
          onHandleInput={setHandle}
          onContinue={noop}
          onNoPost={noop}
        />
      );
  }
}
