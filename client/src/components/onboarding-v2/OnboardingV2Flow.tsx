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
import { AppRecoveryScreen } from "@/components/recovery/AppRecoveryScreen";
import {
  classifyServerQuery,
  isUnauthorizedError,
} from "@/lib/recovery/classifyServerQuery";
import { createSubmitLock, pollWhileActive, retryRead, shouldApplyServerSnapshot } from "@/lib/recovery/guards";
import { useRecoveryBound } from "@/lib/recovery/useRecoveryBound";
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
import { PROFILE_LOOKUP_SLOW_AFTER_MS } from "@shared/personalization/profileLookup";
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
import { preferOnboardingSnapshot } from "./onboardingSnapshot";
import { recommendationWaitState, stepHasDisplaySuggestions } from "./recommendationWait";
import { AudienceStep, GoalStep, MAX_GOALS, PillarsStep, type StepItem } from "./step4";
import { COPY } from "./copy";
import { suggestionRequestKey } from "@shared/personalization/suggestionRequest";
import { InsightPhonePreview } from "./InsightPhonePreview";
import { step4RightPanel } from "./insightPanel";
import {
  isCurrentProfileLookup,
  type ProfileLookupSession,
} from "./profileLookupSession";
import { WhatWorksStep } from "./step3c";
import { screenFromResume } from "./resumeScreen";

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
 * - ?step=goal|audience|pillars  explicit deep link to that strategy step.
 *   Home "Finish setup" does not pass a step, so the server resume step wins.
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

/** Redirects once after render (never set state during render). */
function ProfileLost({ onReset }: { onReset: () => void }) {
  useEffect(() => onReset(), [onReset]);
  return <AppRecoveryScreen view={{ kind: "loading" }} />;
}

export default function OnboardingV2Flow() {
  const [, navigate] = useLocation();
  const posthog = usePostHog();
  const { access } = useExperienceAccess();
  const utils = trpc.useUtils();

  const stateQuery = trpc.onboardingV2.getState.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 2,
    refetchInterval: pollWhileActive(
      data =>
        Boolean(
          data?.analysis &&
            (data.analysis.status === "queued" || data.analysis.status === "running")
        ),
      2000
    ),
  });
  const readAttempt = useRef(0);
  const appliedVersion = useRef<number | null>(null);
  const acceptedState = useRef(stateQuery.data ?? null);
  if (stateQuery.data) {
    const snap = stateQuery.data;
    const chosen = preferOnboardingSnapshot(acceptedState.current, snap);
    if (
      chosen === snap &&
      shouldApplyServerSnapshot({
        requestId: readAttempt.current,
        currentId: readAttempt.current,
        snapshotVersion: snap.version,
        appliedVersion: appliedVersion.current,
      })
    ) {
      appliedVersion.current = snap.version;
      acceptedState.current = snap;
    }
  }
  const state = acceptedState.current ?? undefined;

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
  const [suggestionRetry, setSuggestionRetry] = useState(0);
  const [recWaitExpired, setRecWaitExpired] = useState(false);
  const recRequestedAt = useRef<number | null>(null);
  const recSeenAt = useRef<number | null>(null);
  const latestRecAt = useRef<number | null>(null);
  const seenAnalysis = useRef<string | null>(null);
  const completing = useRef(false);
  const submissions = useRef(createSubmitLock()).current;
  const recommendationRequests = useRef(new Set<string>());
  const [resumeError, setResumeError] = useState(false);
  const [stateRetryKey, setStateRetryKey] = useState(0);
  const lookupSeq = useRef(0);
  const lookupSession = useRef<ProfileLookupSession | null>(null);
  const slowTimer = useRef<number | null>(null);
  const [lookupActive, setLookupActive] = useState(false);
  const [lookupSlow, setLookupSlow] = useState(false);
  const noRightPanel = useNoRightPanel();
  const entry = useRef(readEntry()).current;
  const stateMissing = !state;
  const statePending = stateMissing && (stateQuery.isLoading || stateQuery.isFetching);
  const stateTimedOut = useRecoveryBound(statePending, stateRetryKey);

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
  const requestTopics = trpc.onboardingV2.requestPillarSubtopics.useMutation();
  const restoreItem = trpc.onboardingV2.restorePersonalizationItem.useMutation();
  const resolveStep = trpc.onboardingV2.resolveStep.useMutation();
  const complete = trpc.onboardingV2.complete.useMutation();
  const retryAnalysis = trpc.onboardingV2.retryAnalysis.useMutation();

  const refresh = useCallback(() => {
    readAttempt.current += 1;
    void utils.onboardingV2.getState.cancel();
    void utils.onboardingV2.getState.invalidate();
    void utils.homeV2.context.invalidate();
    void utils.homeV2.videos.invalidate();
    void utils.homeV2.creators.invalidate();
    void utils.onboarding.getState.invalidate();
  }, [utils]);

  const finish = useCallback(async (reason: "resume" | "step" = "step") => {
    if (completing.current) return;
    completing.current = true;
    setResumeError(false);
    try {
      await complete.mutateAsync();
      track("completed");
      await utils.onboarding.getState.invalidate();
      navigate("/", { replace: true });
    } catch {
      completing.current = false;
      if (reason === "resume") setResumeError(true);
      else toast.error("Something went wrong. Try again.");
    }
  }, [complete, navigate, track, utils]);

  // First load: resume where the user left off. A late older snapshot is ignored.
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
      void finish("resume");
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

  const clearSlowTimer = useCallback(() => {
    if (slowTimer.current != null) {
      window.clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
  }, []);

  const cancelLookup = useCallback(() => {
    lookupSeq.current += 1;
    lookupSession.current = null;
    setLookupActive(false);
    setLookupSlow(false);
    clearSlowTimer();
  }, [clearSlowTimer]);

  useEffect(() => clearSlowTimer, [clearSlowTimer]);

  const beginLookup = useCallback(async () => {
    if (!platform || lookupSession.current) return;
    const submitted: ProfileLookupSession = {
      id: ++lookupSeq.current,
      platform,
      handle: handleInput,
    };
    lookupSession.current = submitted;
    setLookupActive(true);
    setLookupSlow(false);
    setPlatformError(null);
    clearSlowTimer();
    slowTimer.current = window.setTimeout(() => {
      if (lookupSession.current?.id === submitted.id) setLookupSlow(true);
    }, PROFILE_LOOKUP_SLOW_AFTER_MS);
    try {
      const res = await lookup.mutateAsync({ platform: submitted.platform, input: submitted.handle });
      if (!isCurrentProfileLookup(lookupSession.current, submitted)) return;
      if (!res.ok) {
        setPlatformError(res.reason as PlatformError);
        track("error", { step: "platform", reason: res.reason });
        return;
      }
      setPreview(res.profile);
      setTypedHandle(res.typedHandle);
      setScreen("profile");
    } catch {
      if (!isCurrentProfileLookup(lookupSession.current, submitted)) return;
      setPlatformError("error");
      track("error", { step: "platform", reason: "error" });
    } finally {
      if (lookupSession.current?.id === submitted.id) {
        lookupSession.current = null;
        setLookupActive(false);
        setLookupSlow(false);
        clearSlowTimer();
      }
    }
  }, [clearSlowTimer, handleInput, lookup, platform, track]);

  const mutating =
    confirm.isPending ||
    notPosting.isPending ||
    saveUseCase.isPending ||
    saveAttribution.isPending ||
    addItem.isPending ||
    editItem.isPending ||
    removeItem.isPending ||
    dismissSubtopic.isPending ||
    restoreSubtopic.isPending ||
    requestTopics.isPending ||
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
  const hasSavedSuggestions = stepHasDisplaySuggestions(step4, items);

  // Ask once per evidence phase. A later snapshot may enrich unconfirmed
  // suggestions. Saved rows stay on screen while that job is still open.
  // A missing goal does not block Audience or Pillars.
  useEffect(() => {
    if (!step4 || !state?.profile) return;
    const requestKey = suggestionRequestKey({
      step: step4,
      version: state.version,
      analysisRunId: state.analysis?.runId ?? null,
      analysisStatus: state.analysis?.status ?? null,
      postsInWindow: state.analysis?.postsInWindow ?? null,
      confirmedGoal,
      confirmedAudience,
      retry: suggestionRetry,
    });
    if (requested[step4] === requestKey) return;
    const once = `${step4}:${requestKey}`;
    if (recommendationRequests.current.has(once)) return;
    recommendationRequests.current.add(once);
    recRequestedAt.current = Date.now();
    recSeenAt.current = latestRecAt.current;
    setRecWaitExpired(false);
    setRequested(r => ({ ...r, [step4]: requestKey }));
    requestRecs.mutate({ step: step4 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step4,
    state?.version,
    state?.profile?.id,
    state?.analysis?.runId,
    state?.analysis?.status,
    state?.analysis?.postsInWindow,
    confirmedGoal,
    confirmedAudience,
    suggestionRetry,
  ]);

  const recStatus = trpc.onboardingV2.recommendationStatus.useQuery(
    { step: step4 ?? "goal" },
    {
      enabled: Boolean(step4 && requested[step4] !== undefined),
      // `at` is the stored outcome time. An earlier run keeps its old `at`,
      // so a reply from any instance is fresh only when that time changes.
      // The wait is bounded so a stuck job becomes a retry, not a second model call.
      refetchInterval: q => {
        const started = recRequestedAt.current;
        if (started == null) return false;
        if (Date.now() - started > 120_000) {
          if (!hasSavedSuggestions) setRecWaitExpired(true);
          return false;
        }
        const data = q.state.data;
        const seen = recSeenAt.current;
        const fresh =
          data != null &&
          data.state !== "running" &&
          typeof data.at === "number" &&
          data.at !== seen;
        return fresh ? false : 2000;
      },
    }
  );
  useEffect(() => {
    if (typeof recStatus.data?.at === "number") latestRecAt.current = recStatus.data.at;
  }, [recStatus.data]);
  const recFresh =
    recStatus.data != null &&
    recStatus.data.state !== "running" &&
    typeof recStatus.data.at === "number" &&
    recStatus.data.at !== recSeenAt.current;
  useEffect(() => {
    if (!recFresh) return;
    void utils.onboardingV2.getState.invalidate();
  }, [recFresh, recStatus.data, utils]);
  const analysisMarker = `${state?.analysis?.status ?? ""}:${state?.analysis?.postsInWindow ?? ""}`;
  useEffect(() => {
    if (!step4) return;
    if (seenAnalysis.current === analysisMarker) return;
    const hadPrevious = seenAnalysis.current != null;
    seenAnalysis.current = analysisMarker;
    if (!hadPrevious) return;
    const status = state?.analysis?.status;
    if (status === "succeeded" || status === "partial" || status === "failed") {
      void utils.onboardingV2.getState.invalidate();
    }
  }, [step4, analysisMarker, state?.analysis?.status, utils]);

  const ai = useMemo(
    () =>
      recommendationWaitState({
        requested: Boolean(step4 && requested[step4] !== undefined),
        status: recStatus.data ?? null,
        seenAt: recSeenAt.current,
        waitExpired: recWaitExpired,
        requestFailed: requestRecs.isError,
        statusUnreadable: recStatus.isError,
        hasSavedSuggestions,
      }),
    [
      step4,
      requested,
      recStatus.data,
      recStatus.isError,
      recWaitExpired,
      requestRecs.isError,
      hasSavedSuggestions,
    ]
  );

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
  const insightScreen = step4 ?? "goal";
  const insightPanel = state?.analysis?.panels?.[insightScreen] ?? null;
  const insightChoice = step4RightPanel({
    status: state?.analysis?.status ?? null,
    panel: insightPanel,
  });
  const step4Panel =
    insightChoice.mode === "insight" && insightPanel ? (
      <InsightPhonePreview
        platform={profilePreview?.platform ?? state?.profile?.platform ?? "instagram"}
        panel={insightPanel}
        showCard={insightChoice.showCard}
        profile={profilePreview}
      />
    ) : profilePreview ? (
      <ProfilePhonePreview profile={profilePreview} />
    ) : (
      <ViralStackPreview />
    );

  /* ---------- actions ---------- */

  const run = async (fn: () => Promise<unknown>, step: string) => {
    if (!submissions.tryAcquire()) return false;
    try {
      await fn();
      return true;
    } catch {
      track("error", { step });
      toast.error("Something went wrong. Try again.");
      return false;
    } finally {
      submissions.release();
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
      else await finish("step");
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

  // Remove now, with Undo. Undo restores that same item id. Subtopics stay on it.
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

  // Dismiss one AI subtopic, with Undo. Subtopic ids stay stable across pillar edits,
  // including a title change, so Undo calls restore with that same id.
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

  // Topic ideas are generated only when the user asks for them, one pillar at a time.
  const askForTopics = (pillarItemId: string) =>
    void run(async () => {
      await requestTopics.mutateAsync({ pillarItemId });
      await refresh();
    }, "pillars");


  if (!state) {
    const view = classifyServerQuery({
      pending: statePending,
      error: stateQuery.error,
      hasData: false,
      timedOut: stateTimedOut,
    });
    return (
      <AppRecoveryScreen
        view={view.kind === "ready" ? { kind: "loading" } : view}
        onRetry={() => {
          const attempt = ++readAttempt.current;
          setStateRetryKey(key => key + 1);
          void retryRead({
            cancel: () => utils.onboardingV2.getState.cancel(),
            refetch: () => stateQuery.refetch(),
            isCurrent: () => readAttempt.current === attempt,
          });
        }}
      />
    );
  }

  if (!screen) {
    if (resumeError) {
      return (
        <AppRecoveryScreen
          view={{ kind: "error" }}
          onRetry={() => {
            void finish("resume");
          }}
        />
      );
    }
    return <AppRecoveryScreen view={{ kind: "loading" }} />;
  }

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
    onRetryAi: () => setSuggestionRetry(n => n + 1),
  });

  switch (screen) {
    case "platform":
      return (
        <PlatformStep
          platform={platform}
          handleInput={handleInput}
          error={platformError}
          busy={mutating}
          looking={lookupActive}
          slow={lookupSlow}
          preview={<ViralStackPreview />}
          onPlatform={p => {
            if (p === platform) return;
            setPlatform(p);
            setPlatformError(null);
            if (lookupSession.current) cancelLookup();
          }}
          onHandleInput={v => {
            setHandleInput(v);
            setPlatformError(null);
            if (lookupSession.current && v !== lookupSession.current.handle) cancelLookup();
          }}
          onNoPost={() => {
            cancelLookup();
            setScreen("niche");
          }}
          onCancel={cancelLookup}
          onContinue={() => void beginLookup()}
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
          onRemoveSubtopic={subtopicId => void dismissWithUndo(subtopicId)}
          topics={state.pillarTopics ?? {}}
          onRequestTopics={askForTopics}
          topicStoreReady={state.subtopicStore?.ready !== false}
        />
      );
  }
}
