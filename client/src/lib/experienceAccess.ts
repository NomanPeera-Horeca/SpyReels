import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { ExperienceAccess } from "@shared/onboardingV2Access";

const LEGACY: ExperienceAccess = { onboarding: "legacy", home: "research", internal: false };

/**
 * Per-user answer from the server (ONBOARDING_V2_MODE / HOME_V2_MODE).
 * While loading, `ready` is false so callers can avoid flashing the wrong
 * page. Any error falls back to the current experience.
 */
export function useExperienceAccess(): { ready: boolean; access: ExperienceAccess } {
  const { user, loading } = useAuth();
  const query = trpc.onboardingV2.experience.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: 1,
  });
  if (loading) return { ready: false, access: LEGACY };
  if (!user) return { ready: true, access: LEGACY };
  if (query.isLoading) return { ready: false, access: LEGACY };
  return { ready: true, access: query.data ?? LEGACY };
}
