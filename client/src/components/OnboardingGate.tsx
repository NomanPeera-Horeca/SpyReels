import { useAuth } from "@/_core/hooks/useAuth";
import { PENDING_INVITATION_KEY } from "@/pages/AcceptInvitation";
import { FEATURE_LAUNCH_DATE_ISO } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { parseResearchIntent } from "@shared/researchIntent";
import { stashResearchHandleForAfterAuth } from "@/lib/researchPendingHandle";

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [showTimeoutFallback, setShowTimeoutFallback] = useState(false);

  const createdAt = toDate(user?.createdAt);
  const isPostLaunchUser =
    Boolean(user) && Boolean(createdAt) && createdAt!.getTime() > FEATURE_LAUNCH_DATE.getTime();

  // Gate runs on (almost) every authed app navigation: keep results fresh
  // (staleTime: 0) so we never show /onboarding off a pre-completion cache.
  // refetchOnWindowFocus: self-heal if another tab or rare drift updated state.
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

  const shouldRedirectToOnboarding = useMemo(() => {
    if (!user || !isPostLaunchUser) return false;
    if (onboardingStateQuery.isLoading || !onboardingStateQuery.data) return false;
    const onboarding = onboardingStateQuery.data;
    return !onboarding.onboardingCompletedAt && !onboarding.onboardingSkippedAt;
  }, [user, isPostLaunchUser, onboardingStateQuery.isLoading, onboardingStateQuery.data]);

  useEffect(() => {
    const isStuck = loading || (isPostLaunchUser && onboardingStateQuery.isLoading);
    if (!isStuck) {
      setShowTimeoutFallback(false);
      return;
    }
    const timer = setTimeout(() => setShowTimeoutFallback(true), 8000);
    return () => clearTimeout(timer);
  }, [loading, isPostLaunchUser, onboardingStateQuery.isLoading]);

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
    if (!shouldRedirectToOnboarding) return;
    if (location === "/onboarding") return;
    const intent = parseResearchIntent(window.location.search);
    if (intent) stashResearchHandleForAfterAuth(intent.handle, intent.autostart, "instagram");
    setLocation("/onboarding", { replace: true });
  }, [location, setLocation, shouldRedirectToOnboarding]);

  if (loading) {
    return showTimeoutFallback ? <GateTimeoutFallback /> : null;
  }
  if (isPostLaunchUser && onboardingStateQuery.isLoading) {
    return showTimeoutFallback ? <GateTimeoutFallback /> : null;
  }
  if (shouldRedirectToOnboarding && location !== "/onboarding") return null;

  return <>{children}</>;
}
