import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export type UsageAction =
  | "scrapeCount"
  | "searchCount"
  | "transcribeCount"
  | "recreateCount"
  | "rewriteCount"
  | "exportCount"
  | "extensionSortCount"
  | "extensionSaveCount"
  | "extensionTranscribeCount"
  | "extensionRecreateCount";

export interface UsageGateResult {
  /** Whether the action is currently allowed */
  allowed: boolean;
  /** Current usage count */
  used: number;
  /** Plan limit for this action */
  limit: number;
  /** The minimum plan required to continue (if blocked) */
  planRequired?: string;
  /** Whether the query is still loading */
  isLoading: boolean;
  /** User's current plan */
  currentPlan: string;
  /** Track usage after performing the action */
  trackUsage: () => void;
}

/**
 * Hook that checks if the current user can perform a specific action
 * based on their plan limits. Returns usage info and a trackUsage function.
 */
export function useUsageGate(action: UsageAction): UsageGateResult {
  const { user } = useAuth();

  const checkQuery = trpc.billing.checkLimit.useQuery(
    { action },
    { enabled: !!user, staleTime: 30_000 }
  );

  const trackMutation = trpc.billing.trackUsage.useMutation();
  const utils = trpc.useUtils();

  const subQuery = trpc.billing.subscription.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60_000,
  });

  const trackUsage = () => {
    if (!user) return;
    trackMutation.mutate(
      { action },
      {
        onSuccess: () => {
          // Invalidate the check query so the next check reflects the new usage
          utils.billing.checkLimit.invalidate({ action });
          utils.billing.usage.invalidate();
        },
      }
    );
  };

  if (!user) {
    return {
      allowed: true, // Don't block unauthenticated users (they'll hit auth wall first)
      used: 0,
      limit: 0,
      isLoading: false,
      currentPlan: "free",
      trackUsage: () => {},
    };
  }

  return {
    allowed: checkQuery.data?.allowed ?? true,
    used: checkQuery.data?.used ?? 0,
    limit: checkQuery.data?.limit ?? 0,
    planRequired: checkQuery.data?.planRequired,
    isLoading: checkQuery.isLoading,
    currentPlan: subQuery.data?.plan || "free",
    trackUsage,
  };
}

/**
 * Plan display names for upgrade prompts
 */
export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  agency: "Agency",
};

/**
 * Plan prices for upgrade prompts
 */
export const PLAN_PRICES: Record<string, string> = {
  starter: "$19/mo",
  pro: "$49/mo",
  business: "$99/mo",
  agency: "$199/mo",
};

/**
 * Action display labels
 */
export const ACTION_LABELS: Record<UsageAction, string> = {
  scrapeCount: "handle scrapes",
  searchCount: "keyword searches",
  transcribeCount: "transcriptions",
  recreateCount: "AI re-creations",
  rewriteCount: "rewrites",
  exportCount: "exports",
  extensionSortCount: "extension sorts",
  extensionSaveCount: "extension saves",
  extensionTranscribeCount: "extension transcriptions",
  extensionRecreateCount: "extension re-creations",
};
