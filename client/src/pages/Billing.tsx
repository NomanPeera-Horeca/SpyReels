import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Crown, CreditCard, ArrowRight, ExternalLink, Sparkles,
  BarChart3, FileText, Mic, Wand2, Bookmark, Tag, Calendar, Search, Clapperboard
} from "lucide-react";

// ─── Usage meter component ──────────────────────────────────────
function UsageMeter({
  icon: Icon,
  label,
  used,
  limit,
  color = "bg-purple-500",
}: {
  icon: React.ElementType;
  label: string;
  used: number;
  limit: number;
  color?: string;
}) {
  const isUnlimited = limit >= 999999;
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && percentage >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-zinc-400" />
          <span className="text-sm text-zinc-300">{label}</span>
        </div>
        <span className={`text-sm font-medium ${isAtLimit ? "text-red-400" : isNearLimit ? "text-amber-400" : "text-zinc-400"}`}>
          {used.toLocaleString()} / {isUnlimited ? "∞" : limit.toLocaleString()}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={`h-1.5 ${isAtLimit ? "[&>div]:bg-red-500" : isNearLimit ? "[&>div]:bg-amber-500" : `[&>div]:${color}`}`}
        />
      )}
      {isUnlimited && (
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-emerald-500/30 to-emerald-500/10 rounded-full" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Billing Page
// ═══════════════════════════════════════════════════════════════
export default function Billing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const subQuery = trpc.billing.subscription.useQuery(undefined, { enabled: !!user });
  const usageQuery = trpc.billing.usage.useQuery(undefined, { enabled: !!user });
  const portalMutation = trpc.billing.portal.useMutation({
    onSuccess: (data) => {
      toast.info("Opening billing portal...");
      window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CreditCard className="h-12 w-12 text-zinc-600" />
        <h2 className="text-xl font-bold">Sign in to manage billing</h2>
        <p className="text-zinc-500 text-sm">View your subscription, usage, and invoices</p>
        <Button onClick={() => { window.location.href = getLoginUrl(); }}>
          Sign In <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    );
  }

  const sub = subQuery.data;
  const rawUsage = usageQuery.data;
  const plan = sub?.plan || "free";
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
  const isFree = plan === "free";

  // Map flat backend data to display-friendly structure
  const usageMeters = rawUsage
    ? [
        {
          icon: Mic,
          label: "Transcriptions",
          used: rawUsage.usage.transcribeCount ?? 0,
          limit: rawUsage.limits.transcriptionsPerMonth ?? 3,
          color: "bg-blue-500",
        },
        {
          icon: Wand2,
          label: "AI Re-Creations",
          used: rawUsage.usage.recreateCount ?? 0,
          limit: rawUsage.limits.recreatesPerMonth ?? 0,
          color: "bg-purple-500",
        },
        {
          icon: Clapperboard,
          label: "B-Roll Generations",
          used: rawUsage.usage.brollGenerationCount ?? 0,
          limit: rawUsage.limits.brollGenerationsPerMonth ?? 0,
          color: "bg-cyan-500",
        },
        {
          icon: FileText,
          label: "Account research",
          used: rawUsage.usage.scrapeCount ?? 0,
          limit: rawUsage.limits.scrapesPerMonth ?? 2,
          color: "bg-amber-500",
        },
        {
          icon: Bookmark,
          label: "Saved Scripts",
          used: rawUsage.usage.exportCount ?? 0,
          limit: rawUsage.limits.savedScripts ?? 5,
          color: "bg-emerald-500",
        },
        {
          icon: Tag,
          label: "Rewrites",
          used: rawUsage.usage.rewriteCount ?? 0,
          limit: rawUsage.limits.rewritesPerScript ?? 0,
          color: "bg-pink-500",
        },
        {
          icon: Search,
          label: "Keyword Searches Today",
          used: rawUsage.usage.searchCount ?? 0,
          limit: rawUsage.limits.searchesPerDay ?? 3,
          color: "bg-cyan-500",
        },
      ]
    : null;

  const planColors: Record<string, string> = {
    free: "text-zinc-400",
    starter: "text-blue-400",
    pro: "text-purple-400",
    business: "text-amber-400",
    agency: "text-emerald-400",
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6" /> Billing & Subscription
        </h1>
        <p className="text-zinc-500 text-sm mt-1">
          Manage your plan, track usage, and view invoices
        </p>
      </div>

      {/* ─── Current Plan Card ─── */}
      <Card className="border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className={`h-5 w-5 ${planColors[plan] || "text-zinc-400"}`} />
                {planName} Plan
              </CardTitle>
              <CardDescription className="mt-1">
                {isFree
                  ? "You're on the free plan. Upgrade to unlock more features."
                  : `Billed ${sub?.billingInterval === "yearly" ? "annually" : "monthly"}`
                }
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!isFree && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => portalMutation.mutate({ origin: window.location.origin })}
                  disabled={portalMutation.isPending}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Manage Subscription
                </Button>
              )}
              <Button
                size="sm"
                className={isFree ? "bg-purple-600 hover:bg-purple-700" : ""}
                variant={isFree ? "default" : "outline"}
                onClick={() => setLocation("/pricing")}
              >
                {isFree ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Upgrade
                  </>
                ) : (
                  "Change Plan"
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {!isFree && sub && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-zinc-500 text-xs mb-0.5">Status</div>
                <Badge className={sub.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                  {sub.status === "active" ? "Active" : sub.status}
                </Badge>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-0.5">Billing Interval</div>
                <div className="text-zinc-300 capitalize">{sub.billingInterval || "monthly"}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-0.5">Next Billing Date</div>
                <div className="text-zinc-300">
                  {sub.currentPeriodEnd
                    ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                    : "-"
                  }
                </div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-0.5">Plan</div>
                <div className={`font-medium ${planColors[plan]}`}>{planName}</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ─── Usage Overview ─── */}
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" /> Usage This Month
          </CardTitle>
          <CardDescription>
            Your current usage resets on the 1st of each month
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {usageMeters ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {usageMeters.map((meter) => (
                  <UsageMeter
                    key={meter.label}
                    icon={meter.icon}
                    label={meter.label}
                    used={meter.used}
                    limit={meter.limit}
                    color={meter.color}
                  />
                ))}
              </div>

              {/* Upgrade nudge for near-limit users */}
              {isFree && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div>
                      <p className="text-sm font-medium text-purple-300">Running low on credits?</p>
                      <p className="text-xs text-zinc-500">Upgrade to Pro for 200 transcriptions and 100 AI re-creations per month</p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700"
                      onClick={() => setLocation("/pricing")}
                    >
                      Upgrade <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
                    <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Quick Actions ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
          onClick={() => setLocation("/pricing")}
        >
          <CardContent className="pt-6 text-center">
            <Sparkles className="h-8 w-8 text-purple-400 mx-auto mb-2" />
            <h3 className="font-medium text-sm mb-1">View Plans</h3>
            <p className="text-xs text-zinc-500">Compare all features</p>
          </CardContent>
        </Card>
        <Card
          className="border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
          onClick={() => {
            if (isFree) {
              toast.info("Upgrade to a paid plan to access billing portal");
              setLocation("/pricing");
            } else {
              portalMutation.mutate({ origin: window.location.origin });
            }
          }}
        >
          <CardContent className="pt-6 text-center">
            <CreditCard className="h-8 w-8 text-blue-400 mx-auto mb-2" />
            <h3 className="font-medium text-sm mb-1">Payment Methods</h3>
            <p className="text-xs text-zinc-500">Update card or billing info</p>
          </CardContent>
        </Card>
        <Card
          className="border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
          onClick={() => {
            if (isFree) {
              toast.info("Upgrade to a paid plan to view invoices");
              setLocation("/pricing");
            } else {
              portalMutation.mutate({ origin: window.location.origin });
            }
          }}
        >
          <CardContent className="pt-6 text-center">
            <FileText className="h-8 w-8 text-amber-400 mx-auto mb-2" />
            <h3 className="font-medium text-sm mb-1">Invoices</h3>
            <p className="text-xs text-zinc-500">Download past receipts</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
