import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePostHog } from "@posthog/react";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Check,
  X,
  Zap,
  Crown,
  Building2,
  Rocket,
  Star,
  ArrowRight,
  Shield,
  Clock,
  Users,
  Sparkles,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Gift,
} from "lucide-react";

// ─── Plan display config ────────────────────────────────────────
const PLAN_DISPLAY = [
  {
    id: "free" as const,
    icon: Zap,
    color: "text-zinc-400",
    borderColor: "border-zinc-700",
    bgGradient: "",
  },
  {
    id: "starter" as const,
    icon: Rocket,
    color: "text-blue-400",
    borderColor: "border-blue-600/30",
    bgGradient: "",
  },
  {
    id: "pro" as const,
    icon: Crown,
    color: "text-purple-400",
    borderColor: "border-purple-500/50",
    bgGradient: "bg-gradient-to-b from-purple-500/10 to-transparent",
    ring: "ring-2 ring-purple-500/40",
  },
  {
    id: "business" as const,
    icon: Building2,
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgGradient: "",
  },
  {
    id: "agency" as const,
    icon: Star,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgGradient: "",
  },
];

// ─── Feature comparison table data ──────────────────────────────
type FeatureValue = boolean | string | number;
interface FeatureRow {
  label: string;
  free: FeatureValue;
  starter: FeatureValue;
  pro: FeatureValue;
  business: FeatureValue;
  agency: FeatureValue;
}

const FEATURE_SECTIONS: { title: string; rows: FeatureRow[] }[] = [
  {
    title: "Account research and search",
    rows: [
      {
        label: "Account research sessions/month",
        free: 2,
        starter: 10,
        pro: 50,
        business: 200,
        agency: "Unlimited",
      },
      {
        label: "Reels per account (max pulled)",
        free: 10,
        starter: 50,
        pro: "Unlimited",
        business: "Unlimited",
        agency: "Unlimited",
      },
      {
        label: "Keyword searches/day",
        free: 3,
        starter: 20,
        pro: "Unlimited",
        business: "Unlimited",
        agency: "Unlimited",
      },
      {
        label: "URL ingestion",
        free: "5 URLs",
        starter: "20 URLs",
        pro: "20 URLs",
        business: "20 URLs",
        agency: "20 URLs",
      },
      {
        label: "Profile preview",
        free: true,
        starter: true,
        pro: true,
        business: true,
        agency: true,
      },
    ],
  },
  {
    title: "Transcription & AI",
    rows: [
      {
        label: "Transcriptions/month",
        free: 3,
        starter: 30,
        pro: 200,
        business: "1,000",
        agency: "Unlimited",
      },
      {
        label: "AI script re-creations/month",
        free: 3,
        starter: 15,
        pro: 100,
        business: 500,
        agency: "Unlimited",
      },
      {
        label: "Rewrites per script",
        free: 3,
        starter: 2,
        pro: 10,
        business: "Unlimited",
        agency: "Unlimited",
      },
      {
        label: "AI delivery cues",
        free: false,
        starter: false,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "Viral structure analysis",
        free: "Preview",
        starter: "Full",
        pro: "Full",
        business: "Full",
        agency: "Full",
      },
    ],
  },
  {
    title: "Script Library & Calendar",
    rows: [
      {
        label: "Saved scripts",
        free: 5,
        starter: 50,
        pro: 500,
        business: "Unlimited",
        agency: "Unlimited",
      },
      {
        label: "Custom tags",
        free: 2,
        starter: 10,
        pro: "Unlimited",
        business: "Unlimited",
        agency: "Unlimited",
      },
      {
        label: "Calendar view",
        free: false,
        starter: true,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "Kanban board",
        free: false,
        starter: true,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "Version history",
        free: false,
        starter: "Last 3",
        pro: "Full",
        business: "Full",
        agency: "Full",
      },
    ],
  },
  {
    title: "Exports",
    rows: [
      {
        label: "SRT subtitle export",
        free: false,
        starter: true,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "CSV export",
        free: false,
        starter: true,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "Google Sheets",
        free: false,
        starter: true,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "Google Docs",
        free: false,
        starter: false,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "PDF/DOCX export",
        free: false,
        starter: false,
        pro: true,
        business: true,
        agency: true,
      },
    ],
  },
  {
    title: "Teleprompter",
    rows: [
      {
        label: "Basic teleprompter",
        free: true,
        starter: true,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "Voice-driven mode",
        free: false,
        starter: false,
        pro: true,
        business: true,
        agency: true,
      },
      {
        label: "Smart take tracking",
        free: false,
        starter: false,
        pro: true,
        business: true,
        agency: true,
      },
    ],
  },
  /* Re-enable with /extension route
  {
    title: "Chrome Extension",
    rows: [
      {
        label: "Sort Feed",
        free: "5/day",
        starter: "25/day",
        pro: "Unlimited",
        business: "Unlimited",
        agency: "Unlimited",
      },
      {
        label: "Save to Dashboard",
        free: "3/day",
        starter: "20/day",
        pro: "Unlimited",
        business: "Unlimited",
        agency: "Unlimited",
      },
      {
        label: "Transcribe in extension",
        free: "3/mo",
        starter: "15/mo",
        pro: "100/mo",
        business: "500/mo",
        agency: "Unlimited",
      },
      {
        label: "Re-Create in extension",
        free: "3/mo",
        starter: "5/mo",
        pro: "50/mo",
        business: "250/mo",
        agency: "Unlimited",
      },
    ],
  },
  */
  {
    title: "Team & Support",
    rows: [
      {
        label: "Team members",
        free: 1,
        starter: 1,
        pro: 3,
        business: 10,
        agency: 25,
      },
      {
        label: "Workspaces",
        free: 1,
        starter: 1,
        pro: 1,
        business: 3,
        agency: 10,
      },
      {
        label: "Priority support",
        free: false,
        starter: "Email",
        pro: "Email",
        business: "Chat",
        agency: "Dedicated",
      },
      {
        label: "API access",
        free: false,
        starter: false,
        pro: false,
        business: true,
        agency: true,
      },
      {
        label: "White-label",
        free: false,
        starter: false,
        pro: false,
        business: false,
        agency: true,
      },
    ],
  },
];

// ─── Social proof data ──────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: "Sarah K.",
    role: "Content Creator",
    text: "Went from 2K to 50K followers in 3 months using the script re-creation feature. The AI understands viral patterns better than I do.",
    avatar: "SK",
  },
  {
    name: "Marcus T.",
    role: "Social Media Manager",
    text: "Managing 8 client accounts is a breeze. The dashboard and script workflow keep every research pass in one place, and we have cut our weekly prep time in half before we even film.",
    avatar: "MT",
  },
  {
    name: "Priya R.",
    role: "Agency Owner",
    text: "ROI was instant. My team produces 4x more scripts per week. The calendar view keeps everything organized.",
    avatar: "PR",
  },
];

const STATS = [
  { value: "12,000+", label: "Creators" },
  { value: "2.5M+", label: "Reels Analyzed" },
  { value: "500K+", label: "Scripts Created" },
  { value: "4.9/5", label: "User Rating" },
];

// ─── Cell renderer ──────────────────────────────────────────────
function CellValue({ value }: { value: FeatureValue }) {
  if (value === true)
    return <Check className="h-4 w-4 text-emerald-400 mx-auto" />;
  if (value === false) return <X className="h-4 w-4 text-zinc-600 mx-auto" />;
  return <span className="text-sm text-zinc-300">{String(value)}</span>;
}

// ─── FAQ ────────────────────────────────────────────────────────
const FAQ = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes! Upgrade instantly and get prorated credit. Downgrade takes effect at the end of your billing cycle.",
  },
  {
    q: "What happens when I hit my limit?",
    a: "You'll see a friendly upgrade prompt. Your existing work is never lost. You can upgrade to continue or wait for the next billing cycle.",
  },
  {
    q: "Is there a free trial for paid plans?",
    a: "The Free plan is your trial. Use it as long as you want. When you're ready to go pro, upgrade and start creating immediately.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. No contracts, no hidden fees. Cancel with one click and keep access until the end of your billing period.",
  },
  {
    q: "Do you offer refunds?",
    a: "We offer a 14-day money-back guarantee on all plans. If you're not satisfied, we'll refund you. No questions asked.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards, debit cards, and PayPal through our secure Stripe payment processor.",
  },
];

// ═══════════════════════════════════════════════════════════════
// Main Pricing Page
// ═══════════════════════════════════════════════════════════════
export default function Pricing() {
  const { user } = useAuth();
  const posthog = usePostHog();
  const [isAnnual, setIsAnnual] = useState(true); // Default to annual
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showFullComparison, setShowFullComparison] = useState(false);

  const plansQuery = trpc.billing.plans.useQuery();
  const subQuery = trpc.billing.subscription.useQuery(undefined, {
    enabled: !!user,
  });
  const checkoutMutation = trpc.billing.checkout.useMutation({
    onSuccess: data => {
      toast.info("Redirecting to checkout...");
      window.open(data.url, "_blank");
    },
    onError: err => toast.error(err.message),
  });

  const plans = useMemo(() => plansQuery.data || [], [plansQuery.data]);
  const currentPlan = subQuery.data?.plan || "free";

  const handleCheckout = (planId: string) => {
    if (!user) {
      window.location.href = getLoginUrl();
      return;
    }
    if (planId === "free") return;
    posthog?.capture("plan_checkout_initiated", {
      plan_id: planId,
      interval: isAnnual ? "yearly" : "monthly",
      current_plan: currentPlan,
    });
    const referralId =
      typeof window !== "undefined" && (window as any).Rewardful?.referral;
    checkoutMutation.mutate({
      planId: planId as any,
      interval: isAnnual ? "yearly" : "monthly",
      origin: window.location.origin,
      referralId:
        typeof referralId === "string" ? referralId : undefined,
    });
  };

  const getButtonText = (planId: string) => {
    if (!user) return "Get Started";
    if (planId === currentPlan) return "Current Plan";
    if (planId === "free") return "Free Forever";
    const planOrder = ["free", "starter", "pro", "business", "agency"];
    return planOrder.indexOf(planId) > planOrder.indexOf(currentPlan)
      ? "Upgrade Now"
      : "Downgrade";
  };

  const getButtonVariant = (
    planId: string
  ): "default" | "outline" | "secondary" => {
    if (planId === currentPlan) return "secondary";
    if (planId === "pro") return "default";
    return "outline";
  };

  return (
    <div className="min-h-screen pb-20">
      {/* ─── Hero Section ─── */}
      <div className="text-center pt-8 pb-6 px-4">
        <Badge
          variant="outline"
          className="mb-4 text-purple-400 border-purple-500/30 px-3 py-1"
        >
          <Gift className="h-3.5 w-3.5 mr-1.5" />
          Launch Special · Save up to 42% on annual plans
        </Badge>
        <h1 className="text-3xl md:text-4xl font-bold mb-3">
          Turn Viral Reels Into{" "}
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
            Your Content Empire
          </span>
        </h1>
        <p className="text-zinc-400 max-w-2xl mx-auto text-base md:text-lg">
          Join 12,000+ creators who use SpyReels to analyze, transcribe, and
          re-create viral content. Pick the plan that matches your ambition.
        </p>
      </div>

      {/* ─── Social Proof Stats ─── */}
      <div className="flex justify-center gap-6 md:gap-10 mb-8 px-4">
        {STATS.map(s => (
          <div key={s.label} className="text-center">
            <div className="text-lg md:text-xl font-bold text-white">
              {s.value}
            </div>
            <div className="text-xs text-zinc-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ─── Billing Toggle ─── */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span
          className={`text-sm font-medium ${!isAnnual ? "text-white" : "text-zinc-500"}`}
        >
          Monthly
        </span>
        <Switch
          checked={isAnnual}
          onCheckedChange={setIsAnnual}
          className="data-[state=checked]:bg-purple-600"
        />
        <span
          className={`text-sm font-medium ${isAnnual ? "text-white" : "text-zinc-500"}`}
        >
          Annual
        </span>
        {isAnnual && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs animate-pulse">
            Save up to 42%
          </Badge>
        )}
      </div>

      {/* ─── Pricing Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 px-4 max-w-[1400px] mx-auto mb-16">
        {plans.map(plan => {
          const display =
            PLAN_DISPLAY.find(d => d.id === plan.id) || PLAN_DISPLAY[0];
          const Icon = display.icon;
          const monthlyPrice = plan.monthlyPrice / 100;
          const yearlyPerMonth = plan.yearlyPrice / 100;
          const isCurrentPlan = plan.id === currentPlan;
          const isPro = plan.id === "pro";
          const isFree = plan.id === "free";

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${display.borderColor} ${display.bgGradient} ${
                isPro ? display.ring + " scale-[1.02]" : ""
              } ${isCurrentPlan ? "border-emerald-500/50" : ""} transition-all hover:scale-[1.01]`}
            >
              {/* Badges */}
              {plan.badge && !isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge
                    className={`${
                      isPro
                        ? "bg-purple-600 text-white"
                        : "bg-zinc-700 text-zinc-200"
                    } text-xs px-3 py-0.5 whitespace-nowrap`}
                  >
                    {plan.badge}
                  </Badge>
                </div>
              )}
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-emerald-600 text-white text-xs px-3 py-0.5">
                    Current Plan
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-2 pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-5 w-5 ${display.color}`} />
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                </div>
                <CardDescription className="text-xs min-h-[2rem]">
                  {plan.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 pb-4">
                {/* Price */}
                <div className="mb-4">
                  {isFree ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">$0</span>
                      <span className="text-zinc-500 text-sm">/forever</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">
                          ${isAnnual ? yearlyPerMonth : monthlyPrice}
                        </span>
                        <span className="text-zinc-500 text-sm">/mo</span>
                      </div>
                      {isAnnual && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-zinc-500 line-through">
                            ${monthlyPrice}/mo
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] text-emerald-400 border-emerald-500/30 px-1.5 py-0"
                          >
                            Save{" "}
                            {Math.round(
                              (1 - yearlyPerMonth / monthlyPrice) * 100
                            )}
                            %
                          </Badge>
                        </div>
                      )}
                      {isAnnual && (
                        <p className="text-[10px] text-zinc-600 mt-0.5">
                          Billed ${(plan.yearlyTotal / 100).toFixed(0)}/year
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Feature list */}
                <ul className="space-y-1.5">
                  {plan.features.map((f: string) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check
                        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isPro ? "text-purple-400" : "text-emerald-400"}`}
                      />
                      <span className="text-zinc-300">{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-0">
                <Button
                  className={`w-full ${
                    isPro && !isCurrentPlan
                      ? "bg-purple-600 hover:bg-purple-700 text-white"
                      : ""
                  }`}
                  variant={getButtonVariant(plan.id)}
                  disabled={isCurrentPlan || checkoutMutation.isPending}
                  onClick={() => handleCheckout(plan.id)}
                >
                  {checkoutMutation.isPending
                    ? "Processing..."
                    : getButtonText(plan.id)}
                  {!isCurrentPlan && !isFree && (
                    <ArrowRight className="h-4 w-4 ml-1" />
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* ─── Trust Badges ─── */}
      <div className="flex flex-wrap justify-center gap-6 mb-16 px-4">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Shield className="h-4 w-4" /> 14-day money-back guarantee
        </div>
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Clock className="h-4 w-4" /> Cancel anytime, no contracts
        </div>
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Users className="h-4 w-4" /> 12,000+ happy creators
        </div>
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <TrendingUp className="h-4 w-4" /> 99.9% uptime SLA
        </div>
      </div>

      {/* ─── Testimonials ─── */}
      <div className="max-w-4xl mx-auto mb-16 px-4">
        <h2 className="text-2xl font-bold text-center mb-8">
          Loved by Creators Worldwide
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TESTIMONIALS.map(t => (
            <Card key={t.name} className="border-zinc-800">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-zinc-500">{t.role}</div>
                  </div>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  "{t.text}"
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ─── Full Feature Comparison ─── */}
      <div className="max-w-[1400px] mx-auto mb-16 px-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2">
            Complete Feature Comparison
          </h2>
          <p className="text-zinc-500 text-sm">
            Every feature, every plan, side by side
          </p>
        </div>

        <Button
          variant="outline"
          className="mx-auto mb-6 flex items-center gap-2"
          onClick={() => setShowFullComparison(!showFullComparison)}
        >
          {showFullComparison ? "Hide" : "Show"} Full Comparison
          {showFullComparison ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>

        {showFullComparison && (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left p-3 font-medium text-zinc-400 min-w-[200px]">
                    Feature
                  </th>
                  {PLAN_DISPLAY.map(d => (
                    <th
                      key={d.id}
                      className={`text-center p-3 font-medium ${d.color} min-w-[100px] ${
                        d.id === "pro" ? "bg-purple-500/5" : ""
                      }`}
                    >
                      {d.id.charAt(0).toUpperCase() + d.id.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_SECTIONS.map(section => (
                  <>
                    <tr
                      key={section.title}
                      className="border-b border-zinc-800/50"
                    >
                      <td
                        colSpan={6}
                        className="p-3 pt-4 font-semibold text-zinc-300 bg-zinc-900/30"
                      >
                        {section.title}
                      </td>
                    </tr>
                    {section.rows.map(row => (
                      <tr
                        key={row.label}
                        className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
                      >
                        <td className="p-3 text-zinc-400">{row.label}</td>
                        {(
                          [
                            "free",
                            "starter",
                            "pro",
                            "business",
                            "agency",
                          ] as const
                        ).map(planId => (
                          <td
                            key={planId}
                            className={`p-3 text-center ${planId === "pro" ? "bg-purple-500/5" : ""}`}
                          >
                            <CellValue value={row[planId]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── FAQ ─── */}
      <div className="max-w-2xl mx-auto mb-16 px-4">
        <h2 className="text-2xl font-bold text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <Card
              key={i}
              className="border-zinc-800 cursor-pointer"
              onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{item.q}</span>
                  {expandedFaq === i ? (
                    <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                  )}
                </div>
                {expandedFaq === i && (
                  <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
                    {item.a}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ─── Final CTA ─── */}
      <div className="text-center px-4 pb-8">
        <Card className="max-w-xl mx-auto border-purple-500/30 bg-gradient-to-b from-purple-500/10 to-transparent">
          <CardContent className="pt-8 pb-6">
            <Sparkles className="h-8 w-8 text-purple-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold mb-2">Ready to Go Viral?</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Start free, upgrade when you're ready. No credit card required.
            </p>
            <div className="flex gap-3 justify-center">
              {!user ? (
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => {
                    window.location.href = getLoginUrl();
                  }}
                >
                  Start Free <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : currentPlan === "free" ? (
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => handleCheckout("pro")}
                  disabled={checkoutMutation.isPending}
                >
                  Upgrade to Pro <Crown className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => (window.location.href = "/billing")}
                >
                  Manage Subscription
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 text-xs text-muted-foreground/60 sm:px-6 lg:px-8">
          <span>&copy; {new Date().getFullYear()} SpyReels</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/affiliate" className="hover:text-foreground">
              Affiliate
            </Link>
            <Link href="/contact" className="hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
