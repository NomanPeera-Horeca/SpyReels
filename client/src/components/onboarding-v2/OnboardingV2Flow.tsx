/**
 * Onboarding v2 flow container: server state, mutations, navigation, resume
 * and analytics. Screens are in steps.tsx and step4.tsx.
 *
 * Rules kept here:
 * - Resume: the first unfinished step comes from the server (resolveResumeStep).
 * - The checklist and "Analyzing" line show only the real analysis job state.
 * - AI never blocks: every step can be confirmed or skipped at any time.
 * - Internal accounts are excluded from analytics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";
import "@/design-system/tokens.css";
import { trpc } from "@/lib/trpc";
import { useExperienceAccess } from "@/lib/experienceAccess";
import type {
  AttributionSource,
  AudiencePayload,
  GoalPayload,
  LanguagePayload,
  NichePayload,
  PersonalizationStep,
  PillarPayload,
  PrimaryUseCase,
  SocialPlatform,
} from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import {
  AnalysisPreview,
  ProfileMobilePreview,
  ProfilePhonePreview,
  ViralStackPreview,
} from "./previews";
import {
  AttributionStep,
  GrowthNicheStep,
  PlatformStep,
  ProfileStep,
  UseCaseStep,
  type PlatformError,
} from "./steps";
import { AudienceStep, GoalStep, MAX_GOALS, PillarsStep, type AiState, type StepItem } from "./step4";
import { COPY } from "./copy";
import { WhatWorksStep } from "./step3c";

/** Same breakpoint as OnboardingShell: below it there is no right panel. */
const NO_PANEL_QUERY = "(max-width: 900px)";

function useNoRightPanel(): boolean {
  const [match, setMatch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NO_PANEL_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(NO_PANEL_QUERY);
    const on = () => setMatch(mql.matches);
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return match;
}

type Screen =
  | "platform"
  | "profile"
  | "niche"
  | "use_case"
  | "attribution"
  | "what_works"
  | PersonalizationStep;

const STEP_ORDER: PersonalizationStep[] = ["goal", "audience", "pillars"];
const STEP_KIND = { goal: "goal", audience: "audience", pillars: "pillar" } as const;

/**
 * Entry points from Home v2 (read once on load):
 * - ?step=goal|audience|pillars  "Finish setup": open that strategy step.
 * - ?add=instagram|tiktok|youtube "Add profile": add another account, then
 *   personalize it (use case and attribution are already answered).
 */
function readEntry(): { step: PersonalizationStep | null; add: SocialPlatform | null } {
  if (typeof window === "undefined") return { step: null, add: null };
  const p = new URLSearchParams(window.location.search);
  const step = p.get("step");
  const add = p.get("add");
  return {
    step: step === "goal" || step === "audience" || step === "pillars" ? step : null,
    add: add === "instagram" || add === "tiktok" || add === "youtube" ? add : null,
  };
}

function screenFromResume(step: string): Screen | "done" {
  switch (step) {
    case "platform":
    case "profile_confirm":
      return "platform";
    case "use_case":
    case "attribution":
    case "goal":
    case "audience":
    case "pillars":
      return step;
    default:
      return "done";
  }
}

/** Redirects once after render (never set state during render). */
function ProfileLost({ onReset }: { onReset: () => void }) {
  useEffect(() => onReset(), [onReset]);
  return null;
}

export default function OnboardingV2Flow() {
  const [, navigate] = useLocation();
  const posthog = usePostHog();
  const { access } = useExperienceAccess();
  const utils = trpc.useUtils();

  const stateQuery = trpc.onboardingV2.getState.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: q => {
      const s = q.state.data;
      return s?.analysis && (s.analysis.status === "queued" || s.analysis.status === "running")
        ? 2000
        : false;
    },
  });
  const state = stateQuery.data;

  const [screen, setScreen] = useState<Screen | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform | null>("instagram");
  const [handleInput, setHandleInput] = useState("");
  const [platformError, setPlatformError] = useState<PlatformError | null>(null);
  const [preview, setPreview] = useState<PublicProfilePreview | null>(null);
  const [typedHandle, setTypedHandle] = useState<string | null>(null);
  const [useCase, setUseCase] = useState<PrimaryUseCase | null>(null);
  const [source, setSource] = useState<AttributionSource | null>(null);
  const [niche, setNiche] = useState<string | null>(null);
  const [requested, setRequested] = useState<Partial<Record<PersonalizationStep, string>>>({});
  const completing = useRef(false);
  const noRightPanel = useNoRightPanel();
  const entry = useRef(readEntry()).current;

  const track = useCallback(
    (event: string, props?: Record<string, unknown>) => {
      if (access.internal) return;
      posthog?.capture(`onboarding_v2_${event}`, props);
    },
    [access.internal, posthog]
  );

  const lookup = trpc.onboardingV2.lookupProfile.useMutation();
  const confirm = trpc.onboardingV2.confirmProfile.useMutation();
  const notPosting = trpc.onboardingV2.startNotPostingYet.useMutation();
  const saveUseCase = trpc.onboardingV2.saveUseCase.useMutation();
  const saveAttribution = trpc.onboardingV2.saveAttribution.useMutation();
  const requestRecs = trpc.onboardingV2.requestRecommendations.useMutation();
  const addItem = trpc.onboardingV2.addItem.useMutation();
  const editItem = trpc.onboardingV2.editItem.useMutation();
  const removeItem = trpc.onboardingV2.removeItem.useMutation();
  const dismissSubtopic = trpc.onboardingV2.dismissPillarSubtopic.useMutation();
  const restoreSubtopic = trpc.onboardingV2.restorePillarSubtopic.useMutation();
  const requestSubtopics = trpc.onboardingV2.requestPillarSubtopics.useMutation();
  const restoreItem = trpc.onboardingV2.restoreItem.useMutation();
  const resolveStep = trpc.onboardingV2.resolveStep.useMutation();
  const complete = trpc.onboardingV2.complete.useMutation();
  const retryAnalysis = trpc.onboardingV2.retryAnalysis.useMutation();

  const refresh = useCallback(() => {
    void utils.onboardingV2.getState.invalidate();
    void utils.homeV2.context.invalidate();
    void utils.homeV2.videos.invalidate();
    void utils.homeV2.creators.invalidate();
    void utils.onboarding.getState.invalidate();
  }, [utils]);

  const finish = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;
    try {
      await complete.mutateAsync();
      track("completed");
      await utils.onboarding.getState.invalidate();
      navigate("/", { replace: true });
    } catch {
      completing.current = false;
      toast.error("Something went wrong. Try again.");
    }
  }, [complete, navigate, track, utils]);

  // First load: resume where the user left off.
  useEffect(() => {
    if (!state || screen !== null) return;
    if (entry.add) {
      setPlatform(entry.add);
      setScreen("platform");
      return;
    }
    if (entry.step && state.profile) {
      setUseCase(state.answers.primaryUseCase);
      setSource(state.answers.attributionSource);
      setScreen(entry.step);
      return;
    }
    const s = screenFromResume(state.resumeStep);
    if (s === "done") {
      void finish();
      return;
    }
    setUseCase(state.answers.primaryUseCase);
    setSource(state.answers.attributionSource);
    if (state.profile?.platform) setPlatform(state.profile.platform);
    setScreen(s);
  }, [state, screen, finish, entry]);

  useEffect(() => {
    if (screen) track("step_viewed", { step: screen });
  }, [screen, track]);

  const mutating =
    lookup.isPending ||
    confirm.isPending ||
    notPosting.isPending ||
    saveUseCase.isPending ||
    saveAttribution.isPending ||
    addItem.isPending ||
    editItem.isPending ||
    removeItem.isPending ||
    dismissSubtopic.isPending ||
    restoreSubtopic.isPending ||
    requestSubtopics.isPending ||
    restoreItem.isPending ||
    resolveStep.isPending ||
    retryAnalysis.isPending ||
    complete.isPending;

  /* ---------- step 4 data ---------- */

  const items = state?.items ?? [];
  const of = <T,>(kind: string) =>
    items.filter(i => i.kind === kind) as unknown as StepItem<T>[];
  const confirmedGoal = items.some(i => i.kind === "goal" && i.status === "confirmed");
  const confirmedAudience = items.some(i => i.kind === "audience" && i.status === "confirmed");
  const isStep4 = screen === "goal" || screen === "audience" || screen === "pillars";
  const step4 = isStep4 ? (screen as PersonalizationStep) : null;

  // Ask the engine for suggestions once per step and answers version, only when it can run.
  useEffect(() => {
    if (!step4 || !state) return;
    const hasItems =
      step4 === "goal"
        ? items.some(i => i.kind === "goal") &&
          items.some(i => i.kind === "niche") &&
          items.some(i => i.kind === "language")
        : items.some(i => i.kind === STEP_KIND[step4]);
    const requestKey =
      step4 === "goal"
        ? `${state.version}:${items.some(i => i.kind === "goal")}:${items.some(i => i.kind === "niche")}:${items.some(i => i.kind === "language")}`
        : String(state.version);
    const ready =
      step4 === "goal" ? true : step4 === "audience" ? confirmedGoal : confirmedGoal && confirmedAudience;
    if (hasItems || !ready || requested[step4] === requestKey) return;
    setRequested(r => ({ ...r, [step4]: requestKey }));
    requestRecs.mutate({ step: step4 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step4, state?.version, items.length, confirmedGoal, confirmedAudience]);

  const recStatus = trpc.onboardingV2.recommendationStatus.useQuery(
    { step: step4 ?? "goal" },
    {
      enabled: Boolean(step4 && requested[step4] !== undefined),
      refetchInterval: q => (q.state.data?.state === "running" ? 2000 : false),
    }
  );
  useEffect(() => {
    if (recStatus.data && recStatus.data.state !== "running") void refresh();
  }, [recStatus.data, refresh]);

  const ai: AiState = useMemo(() => {
    if (!step4 || requested[step4] === undefined) return { state: "idle" };
    const s = recStatus.data;
    if (!s) return requestRecs.isPending ? { state: "running" } : { state: "idle" };
    if (s.state === "running") return { state: "running" };
    if (s.state === "failed") return { state: "failed" };
    if (s.state === "clarify") return { state: "clarify", question: s.question };
    return { state: "idle" };
  }, [step4, requested, recStatus.data, requestRecs.isPending]);

  /* ---------- previews ---------- */

  const profilePreview: PublicProfilePreview | null = useMemo(() => {
    if (preview) return preview;
    const p = state?.profile;
    if (!p?.platform || !p.handle) return null;
    return {
      platform: p.platform,
      handle: p.handle,
      displayName: p.displayName,
      bio: p.bio,
      category: null,
      externalUrl: null,
      avatarUrl: p.avatarUrl,
      bannerUrl: null,
      isVerified: false,
      isPrivate: false,
      postCount: p.postCount,
      followerCount: p.followerCount,
      followingCount: p.followingCount,
      likeCount: null,
      videoCount: null,
      recentPosts: [],
    };
  }, [preview, state?.profile]);

  const shownHandle = typedHandle ?? state?.profile?.handle ?? null;
  const analysisPanel =
    profilePreview && shownHandle ? (
      <AnalysisPreview
        displayName={profilePreview.displayName}
        handle={shownHandle}
        avatarUrl={profilePreview.avatarUrl}
        analysis={state?.analysis ? { status: state.analysis.status, stages: state.analysis.stages } : null}
      />
    ) : (
      <ViralStackPreview />
    );
  // Step 4 right panel: Figma fallback "insight not ready yet" (visitor view, no insight card).
  const step4Panel = profilePreview ? <ProfilePhonePreview profile={profilePreview} /> : <ViralStackPreview />;

  /* ---------- actions ---------- */

  const run = async (fn: () => Promise<unknown>, step: string) => {
    try {
      await fn();
      return true;
    } catch {
      track("error", { step });
      toast.error("Something went wrong. Try again.");
      return false;
    }
  };

  const onRetry = () =>
    void run(async () => {
      await retryAnalysis.mutateAsync();
      track("analysis_retry");
      await refresh();
    }, "analysis_retry");

  // Mobile 3c appears only with real best-Reel data; desktop shows insights in the right panel.
  const showWhatWorks = noRightPanel && Boolean(state?.analysis?.bestPost);
  const afterAttribution = () => setScreen(showWhatWorks ? "what_works" : "goal");

  const goStep4 = (from: PersonalizationStep, action: "confirm" | "skip") =>
    run(async () => {
      await resolveStep.mutateAsync({ step: from, action });
      track(action === "confirm" ? "step_completed" : "step_skipped", { step: from });
      await refresh();
      const next = STEP_ORDER[STEP_ORDER.indexOf(from) + 1];
      if (next) setScreen(next);
      else await finish();
    }, from);

  const saveItem = (
    kind: "goal" | "audience" | "pillar" | "niche" | "language",
    payload: GoalPayload | AudiencePayload | Omit<PillarPayload, "viewSharePercent"> | NichePayload | LanguagePayload,
    itemId: string | null
  ) =>
    run(async () => {
      const value = { kind, payload } as Parameters<typeof addItem.mutateAsync>[0];
      if (itemId) await editItem.mutateAsync({ itemId, value });
      else await addItem.mutateAsync(value);
      track("edited", { kind });
      await refresh();
    }, kind);

  // Remove now, with Undo. Undo restores the removed row itself (the server rebuilds
  // the value from its stored row: description, subtopics, removal states, source).
  const removeWithUndo = (itemId: string, step: string) =>
    run(async () => {
      await removeItem.mutateAsync({ itemId });
      await refresh();
      toast(COPY.personalization.removed, {
        duration: 6000,
        action: {
          label: COPY.personalization.undo,
          onClick: () =>
            void run(async () => {
              await restoreItem.mutateAsync({ itemId });
              await refresh();
            }, step),
        },
      });
    }, step);

  // Dismiss one AI subtopic, with Undo. Subtopic ids are stable across pillar edits,
  // so Undo needs no lookup. The server only restores a dismissed row of a live pillar.
  const dismissWithUndo = (subtopicId: string) =>
    run(async () => {
      await dismissSubtopic.mutateAsync({ subtopicId });
      await refresh();
      toast(COPY.personalization.removed, {
        duration: 6000,
        action: {
          label: COPY.personalization.undo,
          onClick: () =>
            void run(async () => {
              await restoreSubtopic.mutateAsync({ subtopicId });
              await refresh();
            }, "pillars"),
        },
      });
    }, "pillars");

  // Topic ideas are requested by the user only (the "Find topic ideas" / "Try again" action).
  // Nothing here runs on load or after a save. The server enforces the attempt, cooldown and
  // hourly limits and tells us what happened.
  const requestTopics = (pillarItemId: string) =>
    run(async () => {
      const outcome = await requestSubtopics.mutateAsync({ pillarItemId });
      await refresh();
      if (outcome.status === "failed") toast(COPY.personalization.topics.failed);
      if (outcome.status === "rate_limited") toast(COPY.personalization.topics.limited);
    }, "pillars");

  if (!state || !screen) return null;

  const common = (step: PersonalizationStep) => ({
    busy: mutating,
    preview: step4Panel,
    fromPosts: Boolean(state.analysis?.postsInWindow) && items.some(i => i.kind === STEP_KIND[step] && i.status === "suggested"),
    ai,
    onBack: () => {
      track("back", { step });
      const i = STEP_ORDER.indexOf(step);
      setScreen(i > 0 ? STEP_ORDER[i - 1] : showWhatWorks ? "what_works" : "attribution");
    },
    onSkip: () => void goStep4(step, "skip"),
    onConfirm: () => void goStep4(step, "confirm"),
    onStepSelect: (s: PersonalizationStep) => setScreen(s),
  });

  switch (screen) {
    case "platform":
      return (
        <PlatformStep
          platform={platform}
          handleInput={handleInput}
          error={platformError}
          busy={mutating}
          preview={<ViralStackPreview />}
          onPlatform={p => {
            setPlatform(p);
            setPlatformError(null);
          }}
          onHandleInput={v => {
            setHandleInput(v);
            setPlatformError(null);
          }}
          onNoPost={() => setScreen("niche")}
          onContinue={async () => {
            if (!platform) return;
            try {
              const res = await lookup.mutateAsync({ platform, input: handleInput });
              if (!res.ok) {
                setPlatformError(res.reason as PlatformError);
                track("error", { step: "platform", reason: res.reason });
                return;
              }
              setPreview(res.profile);
              setTypedHandle(res.typedHandle);
              setScreen("profile");
            } catch {
              setPlatformError("error");
              track("error", { step: "platform", reason: "error" });
            }
          }}
        />
      );
    case "profile":
      // The looked-up profile lives only in memory; after a reload, start from step 1.
      if (!preview) return <ProfileLost onReset={() => setScreen("platform")} />;
      return (
        <ProfileStep
          profile={preview}
          busy={mutating}
          preview={<ProfilePhonePreview profile={preview} />}
          mobilePreview={<ProfileMobilePreview profile={preview} />}
          onBack={() => setScreen("platform")}
          onNotMe={() => {
            track("not_me");
            setPreview(null);
            setScreen("platform");
          }}
          onConfirm={() =>
            void run(async () => {
              const res = await confirm.mutateAsync({ platform: preview.platform, handle: preview.handle });
              if (!res.ok) {
                setPlatformError(res.reason as PlatformError);
                setScreen("platform");
                return;
              }
              track("step_completed", { step: "profile" });
              await refresh();
              // Adding another profile: the account answers exist, go straight to its strategy.
              setScreen(entry.add && state.answers.primaryUseCase ? "goal" : "use_case");
            }, "profile")
          }
        />
      );
    case "niche":
      return (
        <GrowthNicheStep
          value={niche}
          busy={mutating}
          preview={<ViralStackPreview />}
          onChange={setNiche}
          onBack={() => setScreen("platform")}
          onContinue={() =>
            void run(async () => {
              if (!niche) return;
              await notPosting.mutateAsync({ nicheSlug: niche });
              track("step_completed", { step: "niche" });
              await refresh();
              setScreen("use_case");
            }, "niche")
          }
        />
      );
    case "use_case":
      return (
        <UseCaseStep
          handle={state.profile?.handle ? shownHandle : null}
          runStatus={state.analysis?.status ?? null}
          onRetry={onRetry}
          value={useCase}
          busy={mutating}
          preview={analysisPanel}
          onChange={setUseCase}
          onBack={() => setScreen(state.profile?.status === "not_posting_yet" ? "niche" : "platform")}
          onContinue={() =>
            void run(async () => {
              if (!useCase) return;
              await saveUseCase.mutateAsync({ value: useCase });
              track("step_completed", { step: "use_case", value: useCase });
              setScreen("attribution");
            }, "use_case")
          }
        />
      );
    case "attribution":
      return (
        <AttributionStep
          handle={state.profile?.handle ? shownHandle : null}
          runStatus={state.analysis?.status ?? null}
          onRetry={onRetry}
          value={source}
          busy={mutating}
          preview={analysisPanel}
          onChange={setSource}
          onBack={() => setScreen("use_case")}
          onSkip={() =>
            void run(async () => {
              await saveAttribution.mutateAsync({ value: null });
              track("step_skipped", { step: "attribution" });
              await refresh();
              afterAttribution();
            }, "attribution")
          }
          onContinue={() =>
            void run(async () => {
              if (!source) return;
              await saveAttribution.mutateAsync({ value: source });
              track("step_completed", { step: "attribution", value: source });
              await refresh();
              afterAttribution();
            }, "attribution")
          }
        />
      );
    case "what_works": {
      const best = state.analysis?.bestPost;
      if (!best) return <ProfileLost onReset={() => setScreen("goal")} />;
      return (
        <WhatWorksStep
          best={best}
          onBack={() => setScreen("attribution")}
          onContinue={() => {
            track("step_completed", { step: "what_works" });
            setScreen("goal");
          }}
        />
      );
    }
    case "goal":
      return (
        <GoalStep
          common={common("goal")}
          goals={of<GoalPayload>("goal").slice(0, MAX_GOALS)}
          niche={of<NichePayload>("niche")[0] ?? null}
          language={of<LanguagePayload>("language")[0] ?? null}
          onSaveGoal={(p, id) => saveItem("goal", p, id)}
          onRemoveGoal={id => void removeWithUndo(id, "goal")}
          onSaveNiche={(p, id) => saveItem("niche", p, id)}
          onSaveLanguage={(p, id) => saveItem("language", p, id)}
        />
      );
    case "audience":
      return (
        <AudienceStep
          common={common("audience")}
          audiences={of<AudiencePayload>("audience")}
          onSave={(p, id) => saveItem("audience", p, id)}
          onRemove={id => void removeWithUndo(id, "audience")}
        />
      );
    case "pillars":
      return (
        <PillarsStep
          common={common("pillars")}
          pillars={of<PillarPayload>("pillar")}
          onSave={(p, id) => saveItem("pillar", p, id)}
          onRemove={id => void removeWithUndo(id, "pillars")}
          subtopics={state.pillarSubtopics ?? []}
          topics={state.pillarTopics ?? {}}
          subtopicStoreReady={state.subtopicStore?.ready ?? false}
          onRequestTopics={pillarItemId => void requestTopics(pillarItemId)}
          onRemoveSubtopic={subtopicId => void dismissWithUndo(subtopicId)}
        />
      );
  }
}
