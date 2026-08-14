import { useEffect, useMemo, useState } from "react";
import { useCanonical } from "@/hooks/useCanonical";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Mic2,
  PlayCircle,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Users,
  Video,
  Workflow,
  X,
  Zap,
} from "lucide-react";

type PublicPlanId = "free" | "starter" | "pro" | "business";
type FeatureValue = boolean | string | number;

const PLAN_ORDER: PublicPlanId[] = ["free", "starter", "pro", "business"];

type FeatureSection = { label: string; items: string[] };

const PLAN_COPY: Record<
  PublicPlanId,
  {
    name: string;
    eyebrow: string;
    description: string;
    badge?: string;
    icon: typeof Zap;
    includesPrevious?: string;
    sections: FeatureSection[];
    outcomes: string[];
    featured?: boolean;
  }
> = {
  free: {
    name: "Free",
    eyebrow: "Try the workflow",
    description: "For creators who want proof before they pay.",
    icon: Zap,
    sections: [
      {
        label: "Find viral angles",
        items: [
          "2 account research sessions per month (10 Reels each)",
          "3 keyword searches per day",
          "Engagement metrics (views, likes, comments)",
          "Creator Radar history (re-open any past spy session)",
        ],
      },
      {
        label: "Write your first script",
        items: [
          "3 Reel transcripts per month",
          "3 AI script re-creations per month",
          "3 AI Personal Brand Coach scripts per month",
          "3 rewrites per script",
          "30-day content plan with Spark Deck",
        ],
      },
      {
        label: "Record and organize",
        items: [
          "Basic teleprompter",
          "SpyReels Bot on Telegram",
          "5 saved scripts",
          "Single creator workspace",
        ],
      },
      {
        label: "Support",
        items: ["Email support (best-effort response)"],
      },
    ],
    outcomes: [
      "Find viral angles in your niche",
      "Transcribe a Reel before rewriting it",
      "Test the SpyReels workflow before paying",
    ],
  },
  starter: {
    name: "Solo Creator",
    eyebrow: "Build consistency",
    description: "For creators posting 3 to 5 Reels a week.",
    icon: Rocket,
    includesPrevious: "Free",
    sections: [
      {
        label: "Research at scale",
        items: [
          "10 account research sessions per month (50 Reels each)",
          "20 keyword searches per day",
          "Full transcript + structure on every Reel",
          "Saved Reels library (organize what is working)",
        ],
      },
      {
        label: "More scripts, faster",
        items: [
          "30 Reel transcripts per month",
          "15 AI script re-creations per month",
          "15 AI Personal Brand Coach scripts per month",
          "SpyReels Bot full access on Telegram",
        ],
      },
      {
        label: "Plan and ship",
        items: [
          "30-day content plan with Spark Deck",
          "50 saved scripts",
          "Content calendar view",
          "Kanban workflow board (Idea -> Filmed -> Posted)",
          "Script version history",
        ],
      },
      {
        label: "Exports",
        items: [
          "SRT subtitle export",
          "CSV export",
          "Google Sheets export",
        ],
      },
      {
        label: "Support",
        items: ["Email support (response under 24 hours)"],
      },
    ],
    outcomes: [
      "Plan a full month of content in one sitting",
      "Turn competitor Reels into your own scripts",
      "Export captions, SRT files, and research",
    ],
  },
  pro: {
    name: "Pro",
    eyebrow: "Most creators pick this",
    description:
      "For serious creators building a repeatable content engine.",
    badge: "Best value",
    icon: Trophy,
    featured: true,
    includesPrevious: "Solo Creator",
    sections: [
      {
        label: "Pro research",
        items: [
          "50 account research sessions per month",
          "100 Reels pulled per researched account",
          "Unlimited keyword searches",
          "Full transcript + structure analysis on every Reel",
        ],
      },
      {
        label: "Brand Coach (AI)",
        items: [
          "0-100 viral-potential score on every Reel",
          "Sub-scores for hook, retention, and payoff",
          "Specific strengths, weaknesses, and remix suggestions",
          "Cached per Reel so you can revisit without re-scoring",
        ],
      },
      {
        label: "AI Personal Brand Coach",
        items: [
          "200 Reel transcripts per month",
          "100 AI script re-creations per month",
          "100 AI Personal Brand Coach scripts per month",
          "10 rewrites per script",
          "AI delivery cues + on-camera coaching notes",
        ],
      },
      {
        label: "Pro production",
        items: [
          "Voice-driven teleprompter (hands-free scroll)",
          "Smart take tracking with retake counter",
          "Section bookmarks and hot-section jumps",
        ],
      },
      {
        label: "Team-ready workflow",
        items: [
          "500 saved scripts",
          "Up to 3 team members included",
          "Full script version history",
        ],
      },
      {
        label: "Pro exports",
        items: [
          "Google Docs export",
          "PDF export (print-ready)",
          "Word (DOCX) export",
        ],
      },
      {
        label: "Pro support",
        items: ["Priority email + chat support (response under 4 hours)"],
      },
    ],
    outcomes: [
      "Film hands-free with the voice teleprompter",
      "Get AI delivery cues baked into every script",
      "Run a small creator team without losing scripts",
    ],
  },
  business: {
    name: "Agency / Team",
    eyebrow: "Scale a content studio",
    description:
      "For teams managing multiple creators, brands, or clients.",
    badge: "For teams",
    icon: Users,
    includesPrevious: "Pro",
    sections: [
      {
        label: "Agency-level research",
        items: [
          "200 account research sessions per month",
          "Unlimited Reels per researched account",
          "Unlimited Creator Radar history",
        ],
      },
      {
        label: "Agency script engine",
        items: [
          "1,000 Reel transcripts per month",
          "500 AI script re-creations per month",
          "500 AI Personal Brand Coach scripts per month",
          "Unlimited rewrites per script",
        ],
      },
      {
        label: "Team collaboration",
        items: [
          "10 team members included",
          "3 separate workspaces (one per client or brand)",
          "Unlimited saved scripts",
        ],
      },
      {
        label: "Concierge support",
        items: [
          "Priority chat support (response under 1 hour)",
          "Dedicated onboarding session with a SpyReels strategist",
          "Quarterly performance review and roadmap",
        ],
      },
    ],
    outcomes: [
      "Run multiple creator brands from one workspace",
      "Give every client their own isolated space",
      "Get concierge support and a real onboarding call",
    ],
  },
};

const FEATURE_SECTIONS: {
  title: string;
  rows: {
    label: string;
    free: FeatureValue;
    starter: FeatureValue;
    pro: FeatureValue;
    business: FeatureValue;
  }[];
}[] = [
  {
    title: "Viral research",
    rows: [
      {
        label: "Account research sessions/month",
        free: 2,
        starter: 10,
        pro: 50,
        business: 200,
      },
      {
        label: "Reels pulled per account",
        free: 10,
        starter: 50,
        pro: "Unlimited",
        business: "Unlimited",
      },
      {
        label: "Keyword searches/day",
        free: 3,
        starter: 20,
        pro: "Unlimited",
        business: "Unlimited",
      },
      {
        label: "Reel structure analysis",
        free: "Preview",
        starter: "Full",
        pro: "Full",
        business: "Full",
      },
      {
        label: "Brand Coach viral score (AI)",
        free: false,
        starter: false,
        pro: true,
        business: true,
      },
      {
        label: "Creator Radar history",
        free: true,
        starter: true,
        pro: true,
        business: true,
      },
    ],
  },
  {
    title: "Transcripts and scripts",
    rows: [
      {
        label: "Reel transcripts/month",
        free: 3,
        starter: 30,
        pro: 200,
        business: "1,000",
      },
      {
        label: "AI script re-creations/month",
        free: 3,
        starter: 15,
        pro: 100,
        business: 500,
      },
      {
        label: "AI Personal Brand Coach scripts/month",
        free: 3,
        starter: 15,
        pro: 100,
        business: 500,
      },
      {
        label: "Rewrites per script",
        free: 3,
        starter: 2,
        pro: 10,
        business: "Unlimited",
      },
      {
        label: "AI delivery cues and coaching",
        free: false,
        starter: false,
        pro: true,
        business: true,
      },
    ],
  },
  {
    title: "SpyReels Bot and production",
    rows: [
      {
        label: "SpyReels Bot (Telegram)",
        free: "Limited",
        starter: "Included",
        pro: "Included",
        business: "Included",
      },
      {
        label: "Basic teleprompter",
        free: true,
        starter: true,
        pro: true,
        business: true,
      },
      {
        label: "Voice-driven teleprompter",
        free: false,
        starter: false,
        pro: true,
        business: true,
      },
      {
        label: "Smart take tracking",
        free: false,
        starter: false,
        pro: true,
        business: true,
      },
    ],
  },
  {
    title: "Workflow and sharing",
    rows: [
      {
        label: "Saved scripts",
        free: 5,
        starter: 50,
        pro: 500,
        business: "Unlimited",
      },
      {
        label: "30-day content plan + Spark Deck",
        free: true,
        starter: true,
        pro: true,
        business: true,
      },
      {
        label: "Calendar view",
        free: false,
        starter: true,
        pro: true,
        business: true,
      },
      {
        label: "Kanban workflow board",
        free: false,
        starter: true,
        pro: true,
        business: true,
      },
      {
        label: "Version history",
        free: false,
        starter: "Last 3",
        pro: "Full",
        business: "Full",
      },
      {
        label: "Team members",
        free: 1,
        starter: 1,
        pro: 3,
        business: 10,
      },
      {
        label: "Workspaces",
        free: 1,
        starter: 1,
        pro: 1,
        business: 3,
      },
    ],
  },
  {
    title: "Exports and support",
    rows: [
      {
        label: "SRT subtitle export",
        free: false,
        starter: true,
        pro: true,
        business: true,
      },
      {
        label: "CSV export",
        free: false,
        starter: true,
        pro: true,
        business: true,
      },
      {
        label: "Google Sheets export",
        free: false,
        starter: true,
        pro: true,
        business: true,
      },
      {
        label: "Google Docs, PDF, and DOCX export",
        free: false,
        starter: false,
        pro: true,
        business: true,
      },
      {
        label: "Support",
        free: "Email (best effort)",
        starter: "Email",
        pro: "Priority email + chat",
        business: "Priority chat + onboarding",
      },
    ],
  },
];

const WORKFLOW = [
  {
    icon: Search,
    title: "Research",
    body: "Spy on top-performing Reels by account or keyword before you film.",
  },
  {
    icon: FileText,
    title: "Transcript",
    body: "Get the exact words, structure, and hook behind the viral post.",
  },
  {
    icon: Bot,
    title: "Rewrite",
    body: "Use SpyReels Bot to turn the pattern into a script in your voice.",
  },
  {
    icon: Mic2,
    title: "Record",
    body: "Open the teleprompter, track takes, and film without losing momentum.",
  },
];

const STATS = [
  { value: "12,000+", label: "creators" },
  { value: "2.4M+", label: "Reels analyzed" },
  { value: "180K+", label: "scripts generated" },
  { value: "9 min", label: "research to script" },
];

const RISK_REVERSAL = [
  "Free plan, no card",
  "14-day money-back guarantee",
  "Cancel in one click",
  "Stripe-secured checkout",
  "Built for Reels creators",
];

const ROI_DEFAULTS = {
  reelsPerWeek: 5,
  hoursPerReel: 2,
  hourlyRate: 50,
};

const COMPETITOR_ROWS = [
  { label: "Free plan", spyreels: "Yes, no card", meedro: "No" },
  { label: "Entry paid plan", spyreels: "$19/mo", meedro: "$29/mo" },
  { label: "Pro plan", spyreels: "$49/mo", meedro: "$59/mo" },
  { label: "Team plan", spyreels: "$99/mo", meedro: "$199/mo" },
  { label: "Annual discount", spyreels: "Up to 42%", meedro: "20%" },
  { label: "Teleprompter workflow", spyreels: "Included", meedro: "Not emphasized" },
  { label: "Reel transcripts", spyreels: "Included", meedro: "Included" },
  { label: "Refund window", spyreels: "14 days", meedro: "Not listed" },
];

const TESTIMONIALS = [
  {
    quote:
      "SpyReels turned competitor research from a weekend task into a 10-minute workflow. I finally know what to film before I open the camera.",
    name: "Creator using SpyReels",
    result: "Research to script in under 10 minutes",
  },
  {
    quote:
      "The transcript plus rewrite flow is the reason I upgraded. I can see the hook, study the structure, and record from the teleprompter without switching tools.",
    name: "Short-form creator",
    result: "Full workflow in one tab",
  },
  {
    quote:
      "For clients, the calendar and saved scripts make the whole process feel organized. We are not guessing anymore.",
    name: "Content team lead",
    result: "Repeatable client workflow",
  },
];

const FAQ_ITEMS = [
  {
    q: "Is there a free trial?",
    a: "The Free plan is your trial. You can research accounts, generate transcripts, rewrite scripts, and test the teleprompter without adding a card.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. There are no contracts or hidden fees. Cancel in one click and keep access until the end of your billing period.",
  },
  {
    q: "What is the 14-day money-back guarantee?",
    a: "If you upgrade and SpyReels does not help your workflow, email us within 14 days and we will refund your first payment.",
  },
  {
    q: "What is SpyReels Bot?",
    a: "SpyReels Bot helps you turn research and transcripts into sharper hooks, scripts, angles, and posting ideas based on what is already working in your niche.",
  },
  {
    q: "Do transcripts count against my plan?",
    a: "Yes. Each Reel transcription uses one transcript credit. Your limits reset every billing cycle.",
  },
  {
    q: "Do I need Instagram login access?",
    a: "No. SpyReels analyzes publicly available Reels and does not require your Instagram password.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade, downgrade, or move from monthly to annual from billing. Your saved scripts and research stay in your account.",
  },
  {
    q: "Which plan should I pick?",
    a: "Start with Solo Creator if you post a few times a week. Pick Pro if you want the full research, transcript, Bot, script, and teleprompter workflow with enough volume to post daily.",
  },
];

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function renderFeatureValue(value: FeatureValue) {
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 text-primary" />;
  }
  if (value === false) {
    return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  }
  return <span>{value}</span>;
}

const PRICING_TITLE = "SpyReels Pricing - Plans for Nano and Micro Instagram Creators";
const PRICING_DESCRIPTION =
  "Simple pricing for SpyReels. Free tier, Starter, and Pro plans. No credits, no surprises. Built for creators who want to grow on Reels.";
const PRICING_CANONICAL = `${SPYREELS_SITE_URL}/pricing`;

export default function Pricing() {
  useCanonical("/pricing");
  const { user } = useAuth();
  const posthog = usePostHog();
  const [isAnnual, setIsAnnual] = useState(true);
  const [reelsPerWeek, setReelsPerWeek] = useState(ROI_DEFAULTS.reelsPerWeek);
  const [hoursPerReel, setHoursPerReel] = useState(ROI_DEFAULTS.hoursPerReel);
  const [showComparison, setShowComparison] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!user && window.location.hash === "#plans";
  });

  const plansQuery = trpc.billing.plans.useQuery();
  const subQuery = trpc.billing.subscription.useQuery(undefined, {
    enabled: !!user,
  });
  const checkoutMutation = trpc.billing.checkout.useMutation({});

  const plans = useMemo(() => {
    const byId = new Map(
      (plansQuery.data || []).map(plan => [plan.id as PublicPlanId, plan])
    );
    return PLAN_ORDER.map(id => byId.get(id)).filter(Boolean);
  }, [plansQuery.data]);

  useEffect(() => {
    applyStandardPageMeta({
      title: PRICING_TITLE,
      description: PRICING_DESCRIPTION,
      canonicalUrl: PRICING_CANONICAL,
    });

    injectSchemaScript("pricing-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SPYREELS_SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Pricing",
          item: PRICING_CANONICAL,
        },
      ],
    });

    injectSchemaScript("pricing-product-schema", {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "SpyReels",
      description: "AI-powered Instagram Reels analytics and script generation",
      brand: {
        "@type": "Brand",
        name: "SpyReels",
      },
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "0",
        highPrice: "99",
        priceCurrency: "USD",
        offerCount: "4",
        offers: [
          {
            "@type": "Offer",
            name: "Free",
            price: "0",
            priceCurrency: "USD",
          },
          {
            "@type": "Offer",
            name: "Starter",
            price: "19",
            priceCurrency: "USD",
          },
          {
            "@type": "Offer",
            name: "Pro",
            price: "49",
            priceCurrency: "USD",
          },
          {
            "@type": "Offer",
            name: "Business",
            price: "99",
            priceCurrency: "USD",
          },
        ],
      },
    });

    injectSchemaScript("pricing-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    });

    return () => {
      cleanupSchemaScripts([
        "pricing-breadcrumb-schema",
        "pricing-product-schema",
        "pricing-faq-schema",
      ]);
    };
  }, []);

  // Re-run the browser's anchor scroll AFTER the plans query lands so a
  // /pricing#plans deep link reliably parks on the price cards (the
  // cards are SSR-empty until trpc data arrives, so the initial scroll
  // would otherwise overshoot).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!plansQuery.data || plans.length === 0) return;
    if (window.location.hash !== "#plans") return;
    const el = document.getElementById("plans");
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [plansQuery.data, plans.length]);

  useEffect(() => {
    if (user && window.location.hash === "#plans") {
      setUpgradeModalOpen(true);
    }
  }, [user]);

  const currentPlan = (subQuery.data?.plan || "free") as string;
  const usageCount = subQuery.data?.usage?.recreateCount ?? 0;
  const usageLimit = subQuery.data?.limits?.recreatesPerMonth ?? 3;
  const usageBannerText =
    currentPlan === "free" && usageLimit > 0
      ? `You've used ${usageCount} of ${usageLimit} free remakes this month`
      : null;
  const monthlyHoursSaved = reelsPerWeek * hoursPerReel * 4;
  const monthlyValue = monthlyHoursSaved * ROI_DEFAULTS.hourlyRate;
  const proAnnualPrice = 29;
  const proPayback = Math.max(1, Math.round(monthlyValue / proAnnualPrice));

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

    // Open tab synchronously so the browser does not block it as a popup
    const checkoutTab = window.open("", "_blank");

    checkoutMutation.mutate(
      {
        planId: planId as any,
        interval: isAnnual ? "yearly" : "monthly",
        origin: window.location.origin,
        referralId: typeof referralId === "string" ? referralId : undefined,
      },
      {
        onSuccess: data => {
          if (checkoutTab) {
            checkoutTab.location.href = data.url;
          } else {
            window.location.href = data.url;
          }
        },
        onError: err => {
          checkoutTab?.close();
          toast.error(err.message);
        },
      }
    );
  };

  const getButtonText = (planId: string) => {
    if (planId === currentPlan) return "Current Plan";
    if (planId === "free") return user ? "Free Forever" : "Start Free, No Card";
    const isUpgrade =
      PLAN_ORDER.indexOf(planId as PublicPlanId) >
      PLAN_ORDER.indexOf(currentPlan as PublicPlanId);
    if (!user) {
      const labels: Record<string, string> = {
        starter: "Start with Starter →",
        pro: "Start with Pro →",
        business: "Start with Business →",
        agency: "Start with Agency →",
      };
      return labels[planId] ?? "Get Started →";
    }
    return isUpgrade ? "Upgrade Now →" : "Switch Plan";
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <PublicHeader />

      <section className="relative min-h-[28rem] overflow-hidden border-b border-border/50 sm:min-h-[32rem]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <Badge
            variant="outline"
            className="mb-5 border-primary/30 bg-primary/5 px-4 py-1.5 text-sm text-primary"
          >
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Pricing that pays for itself after one saved filming session
          </Badge>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Stop buying generic AI tools. Build a Reels engine that actually
            gets you to post.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Research viral Reels, pull the transcript, rewrite the angle with
            SpyReels Bot, and record with the teleprompter. Free to start. No
            card required.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => handleCheckout("free")}
              className="h-12 gap-2 px-8 text-base shadow-lg shadow-primary/20"
            >
              Start Free, No Card
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 gap-2 px-8 text-base"
            >
              <a href="#plans">
                See Plans
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map(stat => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border bg-card/70 p-4"
              >
                <p className="text-2xl font-bold text-foreground">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            {WORKFLOW.map(item => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border-border bg-card">
                  <CardContent className="p-5">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mb-2 font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pick the plan that matches your posting pace
            </h2>
            <p className="mt-2 text-muted-foreground">
              Annual is selected by default because it is the best deal.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-border bg-card p-1.5">
            <span
              className={`pl-3 text-sm font-medium ${
                !isAnnual ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Monthly
            </span>
            <Switch checked={isAnnual} onCheckedChange={setIsAnnual} />
            <span
              className={`text-sm font-medium ${
                isAnnual ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Annual
            </span>
            <Badge className="mr-1 bg-primary text-primary-foreground">
              Save up to 42%
            </Badge>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-4">
          {plans.map(plan => {
            if (!plan) return null;
            const id = plan.id as PublicPlanId;
            const copy = PLAN_COPY[id];
            const Icon = copy.icon;
            const monthlyPrice = plan.monthlyPrice / 100;
            const yearlyPerMonth = plan.yearlyPrice / 100;
            const yearlyTotal = plan.yearlyTotal / 100;
            const price = isAnnual ? yearlyPerMonth : monthlyPrice;
            const isFree = id === "free";
            const isCurrentPlan = id === currentPlan;

            return (
              <Card
                key={id}
                className={`relative flex flex-col border-border bg-card ${
                  copy.featured
                    ? "scale-[1.01] border-primary/50 shadow-xl shadow-primary/10"
                    : ""
                }`}
              >
                {copy.badge ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      {copy.badge}
                    </Badge>
                  </div>
                ) : null}
                {isCurrentPlan ? (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="outline" className="bg-background">
                      Current Plan
                    </Badge>
                  </div>
                ) : null}
                <CardContent className="flex h-full flex-col p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
                        {copy.eyebrow}
                      </p>
                      <h3 className="text-2xl font-bold text-foreground">
                        {copy.name}
                      </h3>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>

                  <p className="min-h-[3.5rem] text-sm leading-relaxed text-muted-foreground">
                    {copy.description}
                  </p>

                  <div className="mt-6">
                    {isFree ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">$0</span>
                        <span className="text-sm text-muted-foreground">
                          /forever
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold">
                            ${price}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            /mo
                          </span>
                        </div>
                        {isAnnual ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            ${yearlyTotal.toLocaleString()} billed yearly.
                            Monthly is ${monthlyPrice}/mo.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Switch to annual to save{" "}
                            {Math.round(
                              (1 - yearlyPerMonth / monthlyPrice) * 100
                            )}
                            %.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <Button
                    onClick={() => handleCheckout(id)}
                    disabled={isCurrentPlan || checkoutMutation.isPending}
                    variant={copy.featured ? "default" : "outline"}
                    className="mt-6 w-full gap-2"
                  >
                    {getButtonText(id)}
                    {!isCurrentPlan ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>

                  {copy.includesPrevious ? (
                    <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        Everything in {copy.includesPrevious}, plus:
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-6 space-y-5">
                    {copy.sections.map(section => (
                      <div key={section.label}>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
                          {section.label}
                        </p>
                        <div className="space-y-2">
                          {section.items.map(item => (
                            <div
                              key={item}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <span className="text-sm leading-snug text-muted-foreground">
                                {item}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 border-t border-border pt-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Best for
                    </p>
                    <ul className="space-y-2">
                      {copy.outcomes.map(outcome => (
                        <li
                          key={outcome}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          {outcome}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {RISK_REVERSAL.map(item => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground"
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border/50 bg-card/30">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8">
          <div>
            <Badge
              variant="outline"
              className="mb-4 border-primary/30 bg-primary/5 text-primary"
            >
              <Timer className="mr-2 h-3.5 w-3.5" />
              ROI calculator
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight">
              Your time is the real subscription cost
            </h2>
            <p className="mt-3 text-muted-foreground">
              If SpyReels saves one research and scripting session a week, Pro
              can pay for itself before you publish your next batch.
            </p>
          </div>

          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <div className="space-y-7">
                <div>
                  <div className="mb-3 flex justify-between gap-3">
                    <label className="text-sm font-medium">
                      Reels you plan to publish each week
                    </label>
                    <span className="font-semibold tabular-nums">
                      {reelsPerWeek}
                    </span>
                  </div>
                  <Slider
                    value={[reelsPerWeek]}
                    min={1}
                    max={20}
                    step={1}
                    onValueChange={value => setReelsPerWeek(value[0] ?? 1)}
                  />
                </div>
                <div>
                  <div className="mb-3 flex justify-between gap-3">
                    <label className="text-sm font-medium">
                      Hours you spend researching and scripting each Reel today
                    </label>
                    <span className="font-semibold tabular-nums">
                      {hoursPerReel}
                    </span>
                  </div>
                  <Slider
                    value={[hoursPerReel]}
                    min={1}
                    max={8}
                    step={1}
                    onValueChange={value => setHoursPerReel(value[0] ?? 1)}
                  />
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Hours saved/month
                  </p>
                  <p className="mt-2 text-3xl font-bold">
                    {monthlyHoursSaved}
                  </p>
                </div>
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-primary">
                    Time value/month
                  </p>
                  <p className="mt-2 text-3xl font-bold">
                    {formatCurrency(monthlyValue)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Pro payback
                  </p>
                  <p className="mt-2 text-3xl font-bold">{proPayback}x</p>
                </div>
              </div>
              <p className="mt-5 text-center text-xs text-muted-foreground">
                Assumes your content time is worth $50/hour and Pro annual is
                $29/month.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <Badge
            variant="outline"
            className="mb-4 border-primary/30 bg-primary/5 text-primary"
          >
            <BadgeCheck className="mr-2 h-3.5 w-3.5" />
            Side-by-side value check
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight">
            More Reels workflow, less money than Meedro
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Public comparison based on visible pricing as of May 2026. Always
            verify details before you buy, but the value gap is clear.
          </p>
        </div>

        <Card className="overflow-hidden border-border bg-card">
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[32rem]">
              <div className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-border bg-card/70 px-4 py-3 text-sm font-semibold">
                <span>Decision point</span>
                <span className="text-primary">SpyReels</span>
                <span className="text-muted-foreground">Meedro</span>
              </div>
              {COMPETITOR_ROWS.map(row => (
                <div
                  key={row.label}
                  className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-border px-4 py-3 text-sm last:border-b-0"
                >
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="text-foreground">{row.spyreels}</span>
                  <span className="text-muted-foreground">{row.meedro}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="border-y border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                Full feature comparison
              </h2>
              <p className="mt-2 text-muted-foreground">
                Just the workflow creators can use now: research, transcripts,
                SpyReels Bot, scripts, teleprompter, and posting.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowComparison(value => !value)}
            >
              {showComparison ? "Hide table" : "Show full table"}
            </Button>
          </div>

          {showComparison ? (
            <Card className="overflow-hidden border-border bg-card">
              <CardContent className="overflow-x-auto p-0">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-[1.5fr_repeat(4,1fr)] border-b border-border bg-background px-4 py-4 text-sm font-semibold">
                    <span>Feature</span>
                    {PLAN_ORDER.map(id => (
                      <span key={id} className="text-center">
                        {PLAN_COPY[id].name}
                      </span>
                    ))}
                  </div>
                  {FEATURE_SECTIONS.map(section => (
                    <div key={section.title}>
                      <div className="border-b border-border bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">
                        {section.title}
                      </div>
                      {section.rows.map(row => (
                        <div
                          key={row.label}
                          className="grid grid-cols-[1.5fr_repeat(4,1fr)] border-b border-border px-4 py-3 text-sm last:border-b-0"
                        >
                          <span className="font-medium text-foreground">
                            {row.label}
                          </span>
                          <span className="text-center text-muted-foreground">
                            {renderFeatureValue(row.free)}
                          </span>
                          <span className="text-center text-muted-foreground">
                            {renderFeatureValue(row.starter)}
                          </span>
                          <span className="text-center text-muted-foreground">
                            {renderFeatureValue(row.pro)}
                          </span>
                          <span className="text-center text-muted-foreground">
                            {renderFeatureValue(row.business)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Built to remove every excuse before you film
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Pricing pages convert when the product story is obvious. SpyReels is
            not another blank chat box. It is the workflow from idea to recorded
            Reel.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Video,
              title: "The transcript is the proof",
              body: "You do not start with a blank page. You start with the exact words and structure behind a winning Reel.",
            },
            {
              icon: Bot,
              title: "SpyReels Bot writes in context",
              body: "It has the Reel, the hook, the niche, and the workflow. That beats prompting a generic chatbot from scratch.",
            },
            {
              icon: PlayCircle,
              title: "The teleprompter closes the loop",
              body: "Most tools stop at a draft. SpyReels helps you get from script to recorded take while the idea is still fresh.",
            },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="border-border bg-card">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map(item => (
              <Card key={item.quote} className="border-border bg-card">
                <CardContent className="p-6">
                  <div className="mb-4 flex gap-1 text-primary">
                    {[0, 1, 2, 3, 4].map(star => (
                      <Star key={star} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    "{item.quote}"
                  </p>
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="font-semibold text-foreground">{item.name}</p>
                    <p className="text-xs text-primary">{item.result}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-7">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-background">
                <Workflow className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                A note from Noah
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Most creators do not need more AI outputs. They need a workflow
                that shows them what is working, turns it into a script, and
                helps them record before momentum dies. That is why SpyReels is
                priced around usage, transcripts, scripts, Bot help, and the
                teleprompter.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Questions before upgrading? Email{" "}
                <a
                  href="mailto:noah.perry@spyreels.ai"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  noah.perry@spyreels.ai
                </a>
                .
              </p>
            </CardContent>
          </Card>

          <div>
            <div className="mb-5 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight">
                Pricing questions
              </h2>
            </div>
            <Card className="border-border bg-card">
              <CardContent className="p-2 sm:p-4">
                <Accordion type="single" collapsible>
                  {FAQ_ITEMS.map((item, index) => (
                    <AccordionItem
                      key={item.q}
                      value={`item-${index}`}
                      className="px-3"
                    >
                      <AccordionTrigger className="text-left text-sm font-semibold">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="leading-relaxed text-muted-foreground">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-6 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            SpyReels home
          </Link>
          {" · "}
          <Link href="/blog/guide-instagram-reels-hook-patterns-data" className="text-primary hover:underline">
            Hook patterns data study
          </Link>
          {" · "}
          <Link href="/blog/guide-instagram-reels-content-analysis-2026" className="text-primary hover:underline">
            420 Reels research hub
          </Link>
          {" · "}
          <Link href="/blog" className="text-primary hover:underline">
            Instagram growth blog
          </Link>
          {" · "}
          <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
            Free viral hook generator
          </Link>
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-20 text-center sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary/5 sm:p-10">
          <Clock className="mx-auto mb-5 h-10 w-10 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            You can keep guessing, or you can know what to film today.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Start free. Pull your first transcript. Let SpyReels Bot rewrite it.
            Then record it in the teleprompter.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => handleCheckout("free")}
              className="gap-2"
            >
              Start Free Today
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Talk to Noah</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-lg sm:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Start free</p>
            <p className="text-xs text-muted-foreground">
              No card. Upgrade when ready.
            </p>
          </div>
          <Button size="sm" className="min-h-10 shrink-0" onClick={() => handleCheckout("free")}>
            Start Free, No Card
          </Button>
        </div>
      </div>

      <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-y-auto max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-2xl font-bold tracking-tight">
              Choose your plan
            </DialogTitle>
            {usageBannerText ? (
              <p className="text-sm text-muted-foreground mt-1">
                {usageBannerText}. Upgrade to keep going.
              </p>
            ) : null}
          </DialogHeader>

          <div className="flex justify-center pb-4 px-6">
            <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
              <span
                className={`text-sm font-medium ${
                  !isAnnual ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                Monthly
              </span>
              <button
                type="button"
                onClick={() => setIsAnnual(v => !v)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  isAnnual ? "bg-primary" : "bg-muted"
                }`}
                aria-label="Toggle annual billing"
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    isAnnual ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span
                className={`text-sm font-medium ${
                  isAnnual ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                Annual <span className="text-primary font-semibold">Save 20%</span>
              </span>
            </div>
          </div>

          <div className="grid gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map(plan => {
              if (!plan) return null;
              const id = plan.id as PublicPlanId;
              const copy = PLAN_COPY[id];
              if (!copy) return null;
              const isCurrentPlan = id === currentPlan;
              const isFree = id === "free";
              const monthlyPrice = plan.monthlyPrice / 100;
              const yearlyPerMonth = plan.yearlyPrice / 100;
              const price = isAnnual ? yearlyPerMonth : monthlyPrice;
              return (
                <div
                  key={id}
                  className={`relative rounded-2xl border p-5 flex flex-col ${
                    copy.featured
                      ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  {copy.badge ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        {copy.badge}
                      </span>
                    </div>
                  ) : null}
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {copy.name}
                  </p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-bold text-foreground">
                      ${isFree ? 0 : price}
                    </span>
                    <span className="text-sm text-muted-foreground mb-1">
                      {isFree ? "/forever" : "/mo"}
                    </span>
                  </div>
                  {isAnnual && !isFree ? (
                    <p className="text-xs text-primary font-medium mt-0.5">Billed annually</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                    {copy.description}
                  </p>
                  <Button
                    onClick={() => {
                      handleCheckout(id);
                      setUpgradeModalOpen(false);
                    }}
                    disabled={isCurrentPlan || checkoutMutation.isPending}
                    variant={copy.featured ? "default" : "outline"}
                    className="mt-4 w-full gap-2"
                  >
                    {isCurrentPlan ? "Current Plan" : getButtonText(id)}
                    {!isCurrentPlan ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <PublicFooter />
    </div>
  );
}
