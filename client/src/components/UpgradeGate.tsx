/**
 * UpgradeGate  -  Shared component for feature gating across all pages.
 * 
 * Usage patterns:
 * 1. <UpgradeGate feature="recreate" />  -  Shows inline upgrade prompt
 * 2. <UpgradeGate feature="transcribe" usage={used} limit={max} />  -  Shows usage-aware prompt
 * 3. useUpgradeCheck("transcribe")  -  Hook for programmatic checks
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { Crown, Lock, Sparkles, ArrowRight, Zap, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminPanelClient } from "@/admin/isAdminClient";

// ─── Feature definitions ────────────────────────────────────────
interface FeatureGateConfig {
  label: string;
  description: string;
  minPlan: string;
  upgradeMessage: string;
}

const FEATURE_GATES: Record<string, FeatureGateConfig> = {
  transcribe: {
    label: "Transcription",
    description: "Transcribe reel audio to text with timestamps",
    minPlan: "free",
    upgradeMessage: "You've used all your free transcriptions this month. Upgrade to get more.",
  },
  recreate: {
    label: "AI Script Re-Creation",
    description: "Re-create viral scripts with AI in your voice",
    minPlan: "starter",
    upgradeMessage: "AI Script Re-Creation is available on Starter and above.",
  },
  aiCues: {
    label: "AI Delivery Cues",
    description: "Get AI-powered delivery coaching with visual cues",
    minPlan: "pro",
    upgradeMessage: "AI Delivery Cues are available on Pro and above.",
  },
  calendar: {
    label: "Calendar View",
    description: "Schedule and plan your content with calendar view",
    minPlan: "starter",
    upgradeMessage: "Calendar view is available on Starter and above.",
  },
  kanban: {
    label: "Kanban Board",
    description: "Organize scripts with drag-and-drop Kanban board",
    minPlan: "starter",
    upgradeMessage: "Kanban board is available on Starter and above.",
  },
  srtExport: {
    label: "SRT Export",
    description: "Export transcriptions as SRT subtitle files",
    minPlan: "starter",
    upgradeMessage: "SRT export is available on Starter and above.",
  },
  csvExport: {
    label: "CSV Export",
    description: "Export data as CSV files",
    minPlan: "starter",
    upgradeMessage: "CSV export is available on Starter and above.",
  },
  googleDocs: {
    label: "Google Docs Export",
    description: "Export scripts directly to Google Docs",
    minPlan: "pro",
    upgradeMessage: "Google Docs export is available on Pro and above.",
  },
  pdfExport: {
    label: "PDF/DOCX Export",
    description: "Export scripts as PDF or DOCX files",
    minPlan: "pro",
    upgradeMessage: "PDF/DOCX export is available on Pro and above.",
  },
  voiceTeleprompter: {
    label: "Voice Teleprompter",
    description: "Voice-driven teleprompter with smart scrolling",
    minPlan: "pro",
    upgradeMessage: "Voice-driven teleprompter is available on Pro and above.",
  },
  brandCoach: {
    label: "Brand Coach",
    description: "AI viral-potential score on every Reel with hook, retention, and payoff breakdown",
    minPlan: "pro",
    upgradeMessage: "Brand Coach is available on Pro and above.",
  },
  apiAccess: {
    label: "API Access",
    description: "Programmatic access to all features via REST API",
    minPlan: "business",
    upgradeMessage: "API access is available on Business and above.",
  },
  whiteLabel: {
    label: "White Label",
    description: "Remove branding for client-facing reports",
    minPlan: "agency",
    upgradeMessage: "White-label is available on Agency plan.",
  },
};

const PLAN_ORDER = ["free", "starter", "pro", "business", "agency"];

// ─── Hook: Check if feature is available ────────────────────────
export function useUpgradeCheck(feature: string) {
  const { user } = useAuth();
  const subQuery = trpc.billing.subscription.useQuery(undefined, { enabled: !!user });
  const currentPlan = subQuery.data?.plan || "free";
  const gate = FEATURE_GATES[feature];

  if (!gate) return { allowed: true, loading: false, currentPlan };

  const isUnlimitedUser =
    user?.role === "admin" ||
    isAdminPanelClient(user) ||
    (import.meta.env.VITE_OWNER_OPEN_ID &&
      user?.openId === import.meta.env.VITE_OWNER_OPEN_ID);

  if (isUnlimitedUser) {
    return {
      allowed: true,
      loading: false,
      currentPlan: subQuery.data?.plan || "pro",
      requiredPlan: gate.minPlan,
      gate,
    };
  }

  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const requiredIdx = PLAN_ORDER.indexOf(gate.minPlan);
  const allowed = currentIdx >= requiredIdx;

  return {
    allowed,
    loading: subQuery.isLoading,
    currentPlan,
    requiredPlan: gate.minPlan,
    gate,
  };
}

// ─── Hook: Check usage limits ───────────────────────────────────
export function useUsageCheck() {
  const { user } = useAuth();
  const usageQuery = trpc.billing.usage.useQuery(undefined, { enabled: !!user });
  const subQuery = trpc.billing.subscription.useQuery(undefined, { enabled: !!user });

  return {
    usage: usageQuery.data,
    plan: subQuery.data?.plan || "free",
    loading: usageQuery.isLoading || subQuery.isLoading,
    refetch: usageQuery.refetch,
  };
}

// ─── Inline Upgrade Banner (non-blocking) ───────────────────────
export function UpgradeBanner({
  feature,
  usage,
  limit,
  compact = false,
}: {
  feature: string;
  usage?: number;
  limit?: number;
  compact?: boolean;
}) {
  const [, setLocation] = useLocation();
  const gate = FEATURE_GATES[feature];
  if (!gate) return null;

  const isUsageLimit = usage !== undefined && limit !== undefined && usage >= limit;
  const message = isUsageLimit
    ? `You've used ${usage} of ${limit} ${gate.label.toLowerCase()} this month.`
    : gate.upgradeMessage;

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-purple-500/10 border border-purple-500/20">
        <Lock className="h-3.5 w-3.5 text-purple-400 shrink-0" />
        <span className="text-xs text-purple-300 flex-1">{message}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs text-purple-400 hover:text-purple-300 px-2"
          onClick={() => setLocation("/pricing")}
        >
          Upgrade
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-transparent">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-purple-300">{gate.label}</p>
          <p className="text-xs text-zinc-500">{message}</p>
        </div>
        <Button
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 shrink-0"
          onClick={() => setLocation("/pricing")}
        >
          Upgrade <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Locked Feature Overlay ─────────────────────────────────────
export function LockedOverlay({
  feature,
  children,
}: {
  feature: string;
  children: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  const { allowed, loading } = useUpgradeCheck(feature);
  const gate = FEATURE_GATES[feature];

  if (loading || allowed) return <>{children}</>;

  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none select-none blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg backdrop-blur-[2px]">
        <div className="text-center p-4">
          <Lock className="h-8 w-8 text-purple-400 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">{gate?.label || "Premium Feature"}</p>
          <p className="text-xs text-zinc-500 mb-3">{gate?.upgradeMessage}</p>
          <Button
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
            onClick={() => setLocation("/pricing")}
          >
            <Crown className="h-3.5 w-3.5 mr-1" /> Upgrade
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Upgrade Modal (for limit-hit moments) ──────────────────────
export function UpgradeModal({
  open,
  onClose,
  feature,
  usage,
  limit,
}: {
  open: boolean;
  onClose: () => void;
  feature: string;
  usage?: number;
  limit?: number;
}) {
  const [, setLocation] = useLocation();
  const gate = FEATURE_GATES[feature];
  if (!gate) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-2">
            <Zap className="h-6 w-6 text-purple-400" />
          </div>
          <DialogTitle className="text-center">
            {usage !== undefined ? "You've Hit Your Limit" : "Premium Feature"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {usage !== undefined && limit !== undefined ? (
              <>
                You've used <strong>{usage}</strong> of <strong>{limit}</strong> {gate.label.toLowerCase()} this month.
                Upgrade to continue creating amazing content.
              </>
            ) : (
              gate.upgradeMessage
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Crown className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-sm font-medium">Pro Plan · $29/mo</p>
              <p className="text-xs text-zinc-500">200 transcriptions, 100 AI re-creations, and more</p>
            </div>
            <Badge className="bg-purple-600 text-white text-[10px] ml-auto">Popular</Badge>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Maybe Later
          </Button>
          <Button
            className="flex-1 bg-purple-600 hover:bg-purple-700"
            onClick={() => {
              onClose();
              setLocation("/pricing");
            }}
          >
            View Plans <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pro Badge (for locked features in UI) ──────────────────────
export function ProBadge({ plan = "pro" }: { plan?: string }) {
  return (
    <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/30 px-1.5 py-0 ml-1">
      <Crown className="h-2.5 w-2.5 mr-0.5" />
      {plan.charAt(0).toUpperCase() + plan.slice(1)}
    </Badge>
  );
}

export default UpgradeBanner;
