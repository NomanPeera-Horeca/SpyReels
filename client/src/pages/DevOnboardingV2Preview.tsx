/**
 * DEV ONLY (routed only when import.meta.env.DEV). Renders each onboarding
 * v2 screen with clearly fake fixture data for visual QA against Figma.
 * Usage: /dev/onboarding-v2?screen=platform|profile|use_case|attribution|niche
 *        |goal|audience|pillars
 *        &platform=instagram|tiktok|youtube &error=not_found &selected=1
 *        &run=running|failed|succeeded   (analysis line on 3a/3b)
 *        &ai=idle|running|failed|clarify &empty=1   (step 4)
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
import {
  AudienceStep,
  GoalStep,
  PillarsStep,
  type AiState,
  type StepItem,
} from "@/components/onboarding-v2/step4";
import type {
  AnalysisRunStatus,
  AudiencePayload,
  GoalPayload,
  PillarPayload,
} from "@shared/personalization/model";

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

/** Fixture suggestions, clearly sample text. */
const FAKE_GOAL: StepItem<GoalPayload> = {
  id: "g1",
  status: "suggested",
  evidence: "profile_inferred",
  payload: { text: "Help busy parents cook simple weeknight dinners." },
};
const FAKE_AUDIENCES: StepItem<AudiencePayload>[] = [
  { id: "a1", status: "suggested", evidence: "profile_inferred", payload: { who: "busy parents", outcome: "cook dinner in 20 minutes" } },
  { id: "a2", status: "suggested", evidence: "profile_inferred", payload: { who: "new home cooks", outcome: "build confidence in the kitchen" } },
];
const FAKE_PILLARS: StepItem<PillarPayload>[] = [
  { id: "p1", status: "suggested", evidence: "performance_backed", payload: { title: "20-minute dinners", description: "Fast recipes for weeknights.", viewSharePercent: 48 } },
  { id: "p2", status: "suggested", evidence: "profile_inferred", payload: { title: "Kitchen basics", description: "Skills every new cook needs.", viewSharePercent: null } },
  { id: "p3", status: "suggested", evidence: "profile_inferred", payload: { title: "Grocery hacks", description: "Spend less, waste less.", viewSharePercent: null } },
];

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
  const run = (params.get("run") ?? "running") as AnalysisRunStatus;
  const empty = params.get("empty") === "1";
  const aiParam = params.get("ai") ?? "idle";
  const ai: AiState =
    aiParam === "clarify"
      ? { state: "clarify", question: "What do you want your videos to do for you?" }
      : aiParam === "running" || aiParam === "failed"
        ? { state: aiParam }
        : { state: "idle" };
  const common = {
    busy: false,
    preview: <ProfilePhonePreview profile={profile} />,
    fromPosts: !empty,
    ai,
    onBack: noop,
    onSkip: noop,
    onConfirm: noop,
    onStepSelect: noop,
  };
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
          runStatus={run}
          onRetry={noop}
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
          runStatus={run}
          onRetry={noop}
          value={source}
          busy={false}
          preview={analysis}
          onChange={setSource}
          onBack={noop}
          onSkip={noop}
          onContinue={noop}
        />
      );
    case "goal":
      return (
        <GoalStep
          common={common}
          profile={{ displayName: profile.displayName, handle: profile.handle, platform, avatarUrl: null, followerCount: profile.followerCount }}
          goal={empty ? null : FAKE_GOAL}
          niche={empty ? null : { id: "n1", status: "suggested", evidence: "profile_inferred", payload: { slug: "food", label: "Food" } }}
          language={empty ? null : { id: "l1", status: "suggested", evidence: "profile_inferred", payload: { code: "en", label: "English" } }}
          onSaveGoal={noop}
          onSaveNiche={noop}
          onSaveLanguage={noop}
        />
      );
    case "audience":
      return <AudienceStep common={common} audiences={empty ? [] : FAKE_AUDIENCES} onSave={noop} onRemove={noop} />;
    case "pillars":
      return <PillarsStep common={common} pillars={empty ? [] : FAKE_PILLARS} onSave={noop} onRemove={noop} />;
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
