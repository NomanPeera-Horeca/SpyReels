import { useAuth } from "@/_core/hooks/useAuth";
import { AppRecoveryScreen } from "@/components/recovery/AppRecoveryScreen";
import { PENDING_INVITATION_KEY } from "@/pages/AcceptInvitation";
import { FEATURE_LAUNCH_DATE_ISO } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { classifyServerQuery } from "@/lib/recovery/classifyServerQuery";
import { retryRead } from "@/lib/recovery/guards";
import { useRecoveryBound } from "@/lib/recovery/useRecoveryBound";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { parseResearchIntent } from "@shared/researchIntent";
import { stashResearchHandleForAfterAuth } from "@/lib/researchPendingHandle";
import {
  FIRST_SIGNUP_GUIDE_MS,
  ONBOARDING_RELEASED_KEY,
  decideOnboardingAccess,
  hasLegacyOnboardingProgress,
  hasSavedOnboardingProgress,
} from "@shared/onboardingAccess";

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readReleased(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_RELEASED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeReleased() {
  try {
    window.localStorage.setItem(ONBOARDING_RELEASED_KEY, "1");
  } catch {
    // Private mode can refuse storage. The in-memory flag still covers this visit.
  }
}

function GateTimeoutFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-muted-foreground">
        This is taking longer than expected.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Retry
      </button>
    </div>
  );
}

export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, refresh } = useAuth();
  const [location, setLocation] = useLocation();
  const [showTimeoutFallback, setShowTimeoutFallback] = useState(false);
  const [released, setReleased] = useState(readReleased);
  const [retryKey, setRetryKey] = useState(0);
  const utils = trpc.useUtils();

  const createdAt = toDate(user?.createdAt);
  const isPostLaunchUser =
    Boolean(user) && Boolean(createdAt) && createdAt!.getTime() > FEATURE_LAUNCH_DATE.getTime();
  const accountAgeMs = createdAt ? Date.now() - createdAt.getTime() : null;

  // Completed and skipped stay on the legacy user row. Refetch so another
  // tab finishing setup is seen. This read does not start analysis.
  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, {
    enabled: Boolean(user) && isPostLaunchUser,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      const httpStatus = (error as { data?: { httpStatus?: number } })?.data
        ?.httpStatus;
      if (httpStatus === 401 || httpStatus === 403) return false;
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
  });

  const legacy = onboardingStateQuery.data;
  const completed = Boolean(legacy?.onboardingCompletedAt);
  const skipped = Boolean(legacy?.onboardingSkippedAt);
  const legacyProgress = hasLegacyOnboardingProgress(
    legacy
      ? {
          businessDescription: legacy.businessDescription,
          nicheCount: legacy.selectedNicheSlugs?.length ?? 0,
          hasCreator:
            Array.isArray(legacy.selectedCreatorHandles) &&
            legacy.selectedCreatorHandles.length > 0,
        }
      : null
  );
  const youngAccount =
    accountAgeMs != null && accountAgeMs >= 0 && accountAgeMs <= FIRST_SIGNUP_GUIDE_MS;
  const couldGuide =
    Boolean(user) &&
    isPostLaunchUser &&
    !loading &&
    !completed &&
    !skipped &&
    !released &&
    !legacyProgress &&
    !onboardingStateQuery.isLoading &&
    !onboardingStateQuery.isError &&
    location === "/" &&
    youngAccount;

  // Saved v2 progress is read only when a first-signup guide is still possible.
  const progressQuery = trpc.onboardingV2.getState.useQuery(undefined, {
    enabled: couldGuide,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      const httpStatus = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;
      if (httpStatus === 401 || httpStatus === 403) return false;
      return failureCount < 1;
    },
  });

  const progressPending =
    couldGuide && !progressQuery.data && (progressQuery.isLoading || progressQuery.isFetching);
  const progressTimedOut = useRecoveryBound(progressPending, retryKey);

  const saved = progressQuery.data;
  const savedProgress = hasSavedOnboardingProgress(
    saved
      ? {
          profileConfirmed: Boolean(saved.profile && saved.profile.status !== "pending_confirmation"),
          hasAnswers: Boolean(saved.answers.primaryUseCase || saved.answers.attributionResolved),
          hasItems: saved.items.length > 0,
          resumeStep: saved.resumeStep,
        }
      : null
  );

  const guide =
    decideOnboardingAccess({
      isPostLaunchUser,
      completed,
      skipped,
      hasSavedProgress: legacyProgress || savedProgress,
      released,
      progressUnreadable:
        onboardingStateQuery.isError || progressQuery.isError || progressTimedOut,
      pathname: location,
      accountAgeMs,
    }) === "guide" &&
    !progressPending;

  const onboardingPending =
    location === "/onboarding" &&
    (loading || (isPostLaunchUser && onboardingStateQuery.isLoading && !legacy));
  const onboardingTimedOut = useRecoveryBound(onboardingPending, retryKey);

  useEffect(() => {
    if (location !== "/onboarding" || !user) return;
    writeReleased();
    setReleased(true);
  }, [location, user]);

  useEffect(() => {
    if (!loading) {
      setShowTimeoutFallback(false);
      return;
    }
    const timer = setTimeout(() => setShowTimeoutFallback(true), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (loading || !user) return;
    if (location.startsWith("/invitations/accept")) return;

    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_INVITATION_KEY);
    } catch {
      pending = null;
    }
    const trimmed = pending?.trim();
    if (!trimmed) return;

    try {
      sessionStorage.removeItem(PENDING_INVITATION_KEY);
    } catch {
      // ignore
    }
    setLocation(`/invitations/accept/${encodeURIComponent(trimmed)}`, { replace: true });
  }, [loading, user, location, setLocation]);

  useEffect(() => {
    if (!guide || location === "/onboarding") return;
    const intent = parseResearchIntent(window.location.search);
    if (intent) stashResearchHandleForAfterAuth(intent.handle, intent.autostart, intent.platform);
    setLocation("/onboarding", { replace: true });
  }, [guide, location, setLocation]);

  if (location === "/onboarding" && (onboardingPending || onboardingTimedOut)) {
    const view = classifyServerQuery({
      pending: onboardingPending,
      error: onboardingStateQuery.error,
      hasData: false,
      timedOut: onboardingTimedOut,
    });
    return (
      <AppRecoveryScreen
        view={view.kind === "ready" ? { kind: "loading" } : view}
        onRetry={() => {
          setRetryKey(key => key + 1);
          void retryRead({
            cancel: () => utils.onboarding.getState.cancel(),
            refetch: async () => {
              await refresh();
              return onboardingStateQuery.refetch();
            },
            isCurrent: () => true,
          });
        }}
      />
    );
  }

  if (location === "/" && progressPending && !progressTimedOut && !progressQuery.isError) {
    return (
      <AppRecoveryScreen
        view={{ kind: "loading" }}
        onRetry={() => {
          setRetryKey(key => key + 1);
          void retryRead({
            cancel: () => utils.onboardingV2.getState.cancel(),
            refetch: () => progressQuery.refetch(),
            isCurrent: () => true,
          });
        }}
      />
    );
  }

  if (loading && location !== "/onboarding") {
    return showTimeoutFallback ? <GateTimeoutFallback /> : null;
  }
  if (guide && location !== "/onboarding") return null;

  return <>{children}</>;
}
