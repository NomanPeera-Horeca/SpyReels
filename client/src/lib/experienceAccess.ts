import { useAuth } from "@/_core/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/recovery/classifyServerQuery";
import { trpc } from "@/lib/trpc";
import type { ExperienceAccess } from "@shared/onboardingV2Access";

const LEGACY: ExperienceAccess = { onboarding: "legacy", home: "research", internal: false };

/**
 * Per-user answer from the server (ONBOARDING_V2_MODE / HOME_V2_MODE).
 * While loading, `ready` is false so callers can avoid flashing the wrong
 * page. Any error falls back to the current experience.
 * `retry` reloads that answer. It does not start onboarding work.
 */
export function useExperienceAccess(): {
  ready: boolean;
  access: ExperienceAccess;
  retry: () => void;
} {
  const { user, loading } = useAuth();
  const query = trpc.onboardingV2.experience.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 1,
  });
  const retry = () => {
    void query.refetch();
  };
  if (loading) return { ready: false, access: LEGACY, retry };
  if (!user) return { ready: true, access: LEGACY, retry };
  if (query.isLoading) return { ready: false, access: LEGACY, retry };
  return { ready: true, access: query.data ?? LEGACY, retry };
}
