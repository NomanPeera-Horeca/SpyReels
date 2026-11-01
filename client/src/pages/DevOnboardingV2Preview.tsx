/**
 * DEV ONLY (routed only when import.meta.env.DEV). Renders each onboarding
 * v2 screen with clearly fake fixture data for visual QA against Figma.
 * Usage: /dev/onboarding-v2?screen=platform|profile|use_case|attribution|niche
 *        |what_works|goal|audience|pillars
 *        &platform=instagram|tiktok|youtube &error=not_found &selected=1
 *        &run=running|failed|succeeded   (analysis line on 3a/3b)
 *        &insight=pending|empty|failed   (step 4 right panel)
 *        &ai=idle|running|failed|clarify &empty=1 &saveFail=1  (step 4)
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
import { InsightPhonePreview } from "@/components/onboarding-v2/InsightPhonePreview";
import { step4RightPanel } from "@/components/onboarding-v2/insightPanel";
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
  StarterQuestionsStep,
  PlatformStep,
  ProfileStep,
  UseCaseStep,
  type PlatformError,
} from "@/components/onboarding-v2/steps";
import { WhatWorksStep } from "@/components/onboarding-v2/step3c";
import {
  AudienceStep,
  GoalStep,
  PillarsStep,
  type AiState,
  type PillarSubtopicView,
  type StepItem,
} from "@/components/onboarding-v2/step4";
import type {
  AnalysisRunStatus,
  AudiencePayload,
  GoalPayload,
  PillarPayload,
} from "@shared/personalization/model";
import type { ContentPurpose } from "@shared/personalization/starterQuestions";

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
const FAKE_GOALS: StepItem<GoalPayload>[] = [
  { id: "g1", status: "suggested", evidence: "profile_inferred", payload: { text: "Help parents cook faster" } },
  { id: "g2", status: "suggested", evidence: "profile_inferred", payload: { text: "Grow a cooking community" } },
];
const FAKE_AUDIENCES: StepItem<AudiencePayload>[] = [
  { id: "a1", status: "suggested", evidence: "profile_inferred", payload: { who: "busy parents", outcome: "cook dinner in 20 minutes" } },
  { id: "a2", status: "suggested", evidence: "profile_inferred", payload: { who: "new home cooks", outcome: "build confidence in the kitchen" } },
];
const FAKE_SUBTOPICS: PillarSubtopicView[] = [
  { id: "s1", pillarItemId: "p1", label: "Budget weeknight recipes", status: "suggested" },
  { id: "s2", pillarItemId: "p1", label: "One-pan meals", status: "suggested" },
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
  const lookup = params.get("lookup");
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
  // saveFail=1 simulates a server failure on every save (the editor must stay open).
  const saveFail = params.get("saveFail") === "1";
  const noopSave = async () => !saveFail;
  const run = (params.get("run") ?? "running") as AnalysisRunStatus;
  const empty = params.get("empty") === "1";
  const aiParam = params.get("ai") ?? "idle";
  const ai: AiState =
    aiParam === "clarify"
      ? { state: "clarify", question: "What do you want your videos to do for you?" }
      : aiParam === "running" || aiParam === "failed"
        ? { state: aiParam }
        : { state: "idle" };
  const insightParam = params.get("insight");
  const insightStatus: AnalysisRunStatus =
    insightParam === "pending" ? "running" : insightParam === "failed" ? "failed" : "succeeded";
  const insightPanel = {
    postId: "sample",
    url: null,
    thumbnailUrl: "/marketing/2d6477ed3f11.jpg",
    videoUrl: null,
    views: insightParam === "empty" ? null : 128400,
    headline:
      insightParam === "empty"
        ? "One of your public videos"
        : "Videos starting with a question average 2.4x more views.",
    support:
      insightParam === "empty"
        ? "There are not enough similar videos with view counts to compare a pattern yet."
        : "Compared with 8 other videos that have this metric. This describes a pattern in the posts.",
    figure: insightParam === "empty" ? null : "2.4x",
    confidence: insightParam === "empty" ? ("qualitative" as const) : ("eligible" as const),
    comparison:
      insightParam === "empty"
        ? null
        : {
            metric: "views" as const,
            groupLabel: "starting with a question",
            groupCount: 4,
            groupValue: 100,
            baselineLabel: "other videos",
            baselineCount: 8,
            baselineValue: 40,
            definition: "Mean views of the group divided by mean views of the other videos.",
          },
  };
  const insightChoice = step4RightPanel({ status: insightStatus, panel: insightPanel });
  const step4Preview =
    insightChoice.mode === "insight" ? (
      <InsightPhonePreview
        platform={platform}
        panel={insightPanel}
        showCard={insightChoice.showCard}
        profile={profile}
      />
    ) : (
      <ProfilePhonePreview profile={profile} />
    );
  const common = {
    busy: false,
    preview: step4Preview,
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
    case "what_works":
      return (
        <WhatWorksStep
          best={{ postId: "x", url: "https://example.com/reel", thumbnailUrl: null, title: "Sample best Reel title for visual QA", views: 242_000, followerMultiple: 24 }}
          onBack={noop}
          onContinue={noop}
        />
      );
    case "goal":
      return (
        <GoalStep
          common={common}
          goals={empty ? [] : params.get("goals") === "5" ? [...FAKE_GOALS, ...FAKE_GOALS.map(g => ({ ...g, id: g.id + "b" })), { ...FAKE_GOALS[0], id: "g5" }] : FAKE_GOALS}
          niche={empty ? null : { id: "n1", status: "suggested", evidence: "profile_inferred", payload: { slug: "food", label: "Food" } }}
          language={empty ? null : { id: "l1", status: "suggested", evidence: "profile_inferred", payload: { code: "en", label: "English" } }}
          onSaveGoal={noopSave}
          onRemoveGoal={noop}
          onSaveNiche={noopSave}
          onSaveLanguage={noopSave}
        />
      );
    case "audience":
      return <AudienceStep common={common} audiences={empty ? [] : FAKE_AUDIENCES} onSave={noopSave} onRemove={noop} />;
    case "pillars":
      return <PillarsStep common={common} pillars={empty ? [] : FAKE_PILLARS} subtopics={empty ? [] : FAKE_SUBTOPICS} onSave={noopSave} onRemove={noop} onRemoveSubtopic={noop} topics={{}} onRequestTopics={noop} topicStoreReady={true} />;
    case "starter":
      return <StarterPreview />;
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
          handleInput={handle || (lookup ? "@sample.creator" : "")}
          error={lookup === "timeout" ? "timeout" : error}
          busy={false}
          looking={lookup === "looking" || lookup === "slow"}
          slow={lookup === "slow"}
          preview={<ViralStackPreview />}
          onPlatform={setP}
          onHandleInput={setHandle}
          onContinue={noop}
          onCancel={noop}
          onNoPost={noop}
        />
      );
  }
}

/** ?screen=starter: the starter questions with live local state. */
function StarterPreview() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [purpose, setPurpose] = useState<ContentPurpose | null>(null);
  return (
    <StarterQuestionsStep
      topic={topic}
      audience={audience}
      purpose={purpose}
      busy={false}
      preview={<ViralStackPreview />}
      onTopic={setTopic}
      onAudience={setAudience}
      onPurpose={setPurpose}
      onBack={() => undefined}
      onSkip={() => undefined}
      onContinue={() => undefined}
    />
  );
}

