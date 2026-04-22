import { useAuth } from "@/_core/hooks/useAuth";
import { FEATURE_LAUNCH_DATE_ISO } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const createdAt = toDate(user?.createdAt);
  const isPostLaunchUser =
    Boolean(user) && Boolean(createdAt) && createdAt!.getTime() > FEATURE_LAUNCH_DATE.getTime();

  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, {
    enabled: Boolean(user) && isPostLaunchUser,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const shouldRedirectToOnboarding = useMemo(() => {
    if (!user || !isPostLaunchUser) return false;
    if (onboardingStateQuery.isLoading || !onboardingStateQuery.data) return false;
    const onboarding = onboardingStateQuery.data;
    return !onboarding.onboardingCompletedAt && !onboarding.onboardingSkippedAt;
  }, [user, isPostLaunchUser, onboardingStateQuery.isLoading, onboardingStateQuery.data]);

  useEffect(() => {
    if (!shouldRedirectToOnboarding) return;
    if (location === "/onboarding") return;
    setLocation("/onboarding");
  }, [location, setLocation, shouldRedirectToOnboarding]);

  if (loading) return null;
  if (isPostLaunchUser && onboardingStateQuery.isLoading) return null;
  if (shouldRedirectToOnboarding && location !== "/onboarding") return null;

  return <>{children}</>;
}
