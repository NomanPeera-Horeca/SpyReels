import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Crown, ArrowRight, Sparkles, Lock } from "lucide-react";
import { PLAN_NAMES, PLAN_PRICES, ACTION_LABELS, type UsageAction } from "@/hooks/useUsageGate";

interface UpgradePromptProps {
  /** The action that hit the limit */
  action: UsageAction;
  /** Current usage count */
  used: number;
  /** Plan limit */
  limit: number;
  /** The plan required to unlock more */
  planRequired?: string;
  /** Visual variant */
  variant?: "inline" | "banner" | "modal";
  /** Optional custom message */
  message?: string;
  /** Optional callback when dismissed */
  onDismiss?: () => void;
}

/**
 * Soft upgrade prompt shown when users hit their plan limits.
 * Non-blocking  -  users can dismiss and continue browsing.
 */
export function UpgradePrompt({
  action,
  used,
  limit,
  planRequired = "pro",
  variant = "inline",
  message,
  onDismiss,
}: UpgradePromptProps) {
  const [, setLocation] = useLocation();
  const planName = PLAN_NAMES[planRequired] || "Pro";
  const planPrice = PLAN_PRICES[planRequired] || "$49/mo";
  const actionLabel = ACTION_LABELS[action] || "this feature";

  const defaultMessage = `You've used ${used}/${limit} ${actionLabel} this month. Upgrade to ${planName} for more.`;
  const displayMessage = message || defaultMessage;

  if (variant === "banner") {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
            <Crown className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-purple-300">{displayMessage}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {planName} starts at {planPrice}. Cancel anytime.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {onDismiss && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-500" onClick={onDismiss}>
              Later
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => setLocation("/pricing")}
          >
            Upgrade <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (variant === "modal") {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="h-14 w-14 rounded-full bg-purple-500/20 flex items-center justify-center">
          <Lock className="h-7 w-7 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold mb-1">Upgrade to Continue</h3>
          <p className="text-sm text-zinc-400">{displayMessage}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> 14-day money-back</span>
          <span>|</span>
          <span>Cancel anytime</span>
        </div>
        <div className="flex gap-3">
          {onDismiss && (
            <Button variant="outline" onClick={onDismiss}>
              Maybe Later
            </Button>
          )}
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => setLocation("/pricing")}
          >
            View Plans <Crown className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Default: inline variant
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs animate-in fade-in duration-200">
      <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span className="text-amber-300 flex-1">{displayMessage}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[10px] px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 shrink-0"
        onClick={() => setLocation("/pricing")}
      >
        Upgrade
      </Button>
    </div>
  );
}

/**
 * Feature lock overlay for features that require a specific plan.
 * Shows a subtle lock icon and upgrade CTA over the feature area.
 */
export function FeatureLock({
  feature,
  requiredPlan = "starter",
  children,
}: {
  feature: string;
  requiredPlan?: string;
  children: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  const planName = PLAN_NAMES[requiredPlan] || "Starter";

  return (
    <div className="relative group">
      <div className="opacity-50 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex flex-col items-center gap-2 text-center p-4">
          <Lock className="h-5 w-5 text-zinc-400" />
          <p className="text-xs text-zinc-400">
            {feature} requires <span className="text-purple-400 font-medium">{planName}</span> plan
          </p>
          <Button
            size="sm"
            className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
            onClick={() => setLocation("/pricing")}
          >
            Upgrade
          </Button>
        </div>
      </div>
    </div>
  );
}
