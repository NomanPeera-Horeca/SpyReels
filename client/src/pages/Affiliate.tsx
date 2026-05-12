import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Copy,
  Crown,
  GraduationCap,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageCircle,
  PenSquare,
  Rocket,
  Sparkles,
  Star,
  Tag,
  Trophy,
  Users,
  Youtube,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

const REWARDFUL_SIGNUP_URL = "https://spy-reels.getrewardful.com/signup";

const COMMISSION_RATE = 0.2;

type PlanId = "starter" | "pro" | "business";

const PLAN_OPTIONS: { id: PlanId; label: string; price: number }[] = [
  { id: "starter", label: "Starter ($19/mo)", price: 19 },
  { id: "pro", label: "Pro ($39/mo)", price: 39 },
  { id: "business", label: "Business ($79/mo)", price: 79 },
];

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function computeEarnings(opts: {
  referralsPerMonth: number;
  planPrice: number;
  monthsStaying: number;
}) {
  const { referralsPerMonth, planPrice, monthsStaying } = opts;
  const stayCapped = Math.max(1, Math.min(12, monthsStaying));
  const perCohortMonthly = referralsPerMonth * planPrice * COMMISSION_RATE;

  let year1CohortMonths = 0;
  let year1ToYear2Spillover = 0;
  for (let m = 1; m <= 12; m++) {
    year1CohortMonths += Math.min(13 - m, stayCapped);
    year1ToYear2Spillover += Math.max(0, stayCapped + m - 13);
  }

  const monthlyAtFullRamp = perCohortMonthly * stayCapped;
  const year1Total = perCohortMonthly * year1CohortMonths;
  const year2NewCohorts = perCohortMonthly * year1CohortMonths;
  const year2Spillover = perCohortMonthly * year1ToYear2Spillover;
  const twoYearTotal = year1Total + year2NewCohorts + year2Spillover;

  return { monthlyAtFullRamp, year1Total, twoYearTotal };
}

const REASONS = [
  {
    icon: Zap,
    title: "Free to start, no card required",
    body: "Your audience clicks, signs up, sees value, then upgrades. Lower friction means more conversions.",
  },
  {
    icon: Sparkles,
    title: "Built specifically for Reels creators",
    body: "Not a generic AI tool. Every feature targets one workflow: research, transcribe, script, post. Your audience will recognize themselves on the landing page.",
  },
  {
    icon: BadgeCheck,
    title: "60-day cookie window",
    body: "Most affiliate programs give you 30 days. We give you 60. If your audience comes back to buy weeks later, you still get paid.",
  },
  {
    icon: Rocket,
    title: "Live demo on the landing page",
    body: "Your audience does not have to guess what SpyReels does. The hero video shows the full workflow in 75 seconds. Higher intent traffic equals higher conversions.",
  },
];

const TIERS = [
  {
    id: "partner",
    icon: Users,
    name: "Partner",
    range: "1 to 9 active referrals",
    rate: "20%",
    months: "12 months",
    perks: ["Recurring commission", "Swipe copy library", "Banner pack"],
  },
  {
    id: "silver",
    icon: Star,
    name: "Silver",
    range: "10 to 24 active referrals",
    rate: "22%",
    months: "12 months",
    perks: ["Higher recurring rate", "Priority email support", "Quarterly partner update call"],
  },
  {
    id: "gold",
    icon: Trophy,
    name: "Gold",
    range: "25 to 49 active referrals",
    rate: "25%",
    months: "12 months",
    perks: ["Top creator co-marketing slots", "Early access to new features", "Featured on the partner page"],
  },
  {
    id: "platinum",
    icon: Crown,
    name: "Platinum",
    range: "50+ active referrals",
    rate: "30%",
    months: "12 months",
    perks: ["Custom promo code for your audience", "Direct founder line", "Custom co-branded landing page"],
  },
];

const PERKS = [
  {
    icon: LayoutDashboard,
    title: "Personal dashboard",
    body: "Track clicks, signups, conversions, and earnings in one place.",
  },
  {
    icon: Copy,
    title: "Swipe copy library",
    body: "Ready to send tweets, Reels captions, newsletter blurbs, and DM scripts.",
  },
  {
    icon: ImageIcon,
    title: "Banner pack",
    body: "On brand graphics sized for IG stories, YouTube end cards, and newsletter headers.",
  },
  {
    icon: Tag,
    title: "Custom promo codes",
    body: "Personal coupon code for your audience.",
    flag: "Top affiliates only",
  },
  {
    icon: MessageCircle,
    title: "Founder access",
    body: "Direct line to the founders for asset requests, joint campaigns, and roadmap input.",
    flag: "Top affiliates only",
  },
  {
    icon: Sparkles,
    title: "First-look at new features",
    body: "Preview new tools before launch so your content lands the same week we ship.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Apply in 30 seconds",
    body: "Sign up at spy-reels.getrewardful.com. Approved within 24 hours for most applicants.",
  },
  {
    number: "02",
    title: "Get your link and assets",
    body: "Receive your unique tracking link, plus access to the swipe copy library and banner pack.",
  },
  {
    number: "03",
    title: "Earn every month",
    body: "Share where your audience lives. Get paid monthly via PayPal or Wise. Minimum payout is $50.",
  },
];

const AUDIENCES = [
  {
    icon: Megaphone,
    title: "Instagram and TikTok creators",
    body: "You teach your audience how to grow on social. SpyReels is exactly the tool you already wish existed for your community.",
  },
  {
    icon: PenSquare,
    title: "Content marketing newsletter writers",
    body: "Your subscribers ship content for a living. A short-form research and scripting tool fits naturally between the case studies and the playbooks.",
  },
  {
    icon: GraduationCap,
    title: "Course creators and coaches",
    body: "You sell results to creators who need to produce more content. SpyReels closes the gap between strategy lessons and the next reel they actually post.",
  },
  {
    icon: Youtube,
    title: "YouTubers covering AI tools",
    body: "Your viewers are early adopters. A creator focused AI tool with a free plan and a working demo lands cleanly inside any tool review or tier list.",
  },
];

const FAQ_ITEMS = [
  {
    q: "How and when do I get paid?",
    a: "Payments go out monthly via PayPal or Wise once your balance crosses the $50 minimum. Each cycle covers commissions confirmed in the prior month.",
  },
  {
    q: "What counts as a qualified referral?",
    a: "Any new paid subscriber who signs up through your unique link within 60 days of their first click. Self referrals and refunded customers do not count.",
  },
  {
    q: "What is the 60-day cookie window?",
    a: "If someone clicks your link, our tracking remembers them for 60 days. They can come back later, sign up, and you still get credit for the conversion.",
  },
  {
    q: "Do recurring commissions stop if my referral upgrades or downgrades?",
    a: "No. You earn your commission rate on whatever they pay each month for the full 12 month window, whether that is Starter, Pro, or Business.",
  },
  {
    q: "What if my audience signs up for the free plan?",
    a: "You get credit the moment they upgrade to any paid plan, as long as it happens inside the 60 day cookie window.",
  },
  {
    q: "Can I run paid ads on the SpyReels brand name?",
    a: "No bidding on SpyReels or close variants in Google, Meta, or TikTok ads. Paid ads using your own creatives on your own audiences are fine.",
  },
  {
    q: "Will custom promo codes affect my commission?",
    a: "Custom promo codes are reserved for Platinum partners. When activated, they apply a small discount for your audience and do not reduce your commission rate.",
  },
  {
    q: "How fast does the application get reviewed?",
    a: "Most approvals happen inside 24 hours. We manually review every application, so very off fit applicants may be declined or asked for more context.",
  },
];

export default function Affiliate() {
  const [referrals, setReferrals] = useState<number>(10);
  const [planId, setPlanId] = useState<PlanId>("pro");
  const [monthsStaying, setMonthsStaying] = useState<number>(8);

  const planPrice = useMemo(
    () => PLAN_OPTIONS.find((p) => p.id === planId)?.price ?? 39,
    [planId]
  );

  const earnings = useMemo(
    () =>
      computeEarnings({
        referralsPerMonth: referrals,
        planPrice,
        monthsStaying,
      }),
    [referrals, planPrice, monthsStaying]
  );

  const handleScrollToCalculator = () => {
    const el = document.getElementById("calculator");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Nav ─── */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img
                src={LOGO_URL}
                alt="SpyReels"
                className="h-9 w-9 rounded-lg"
              />
              <span className="text-lg font-semibold tracking-tight">
                SpyReels
              </span>
            </Link>
            <div className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
              <Link
                href="/pricing"
                className="transition-colors hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/blog"
                className="transition-colors hover:text-foreground"
              >
                Blog
              </Link>
              <Link
                href="/contact"
                className="transition-colors hover:text-foreground"
              >
                Contact
              </Link>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground sm:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── 1. Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-6 border-primary/30 bg-primary/5 px-4 py-1.5 text-sm text-primary"
            >
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              SpyReels Partner Program
            </Badge>
            <h1 className="mb-6 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Your audience already wants this.{" "}
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                Now get paid every time they buy.
              </span>
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              20% recurring commission for 12 months. 60-day cookie window. Two
              times longer than every other AI tool out there. Join the
              SpyReels Partner Program.
            </p>
            <div className="mb-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button
                size="lg"
                asChild
                className="h-12 gap-2 px-8 text-base shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30"
              >
                <a
                  href={REWARDFUL_SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Become a Partner
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleScrollToCalculator}
                className="h-12 gap-2 px-8 text-base"
              >
                See how much you can earn
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/80">
              Powered by Rewardful. Monthly payouts via PayPal or Wise. Track
              every click, conversion, and payment in real time.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 2. Earnings Calculator ─── */}
      <section id="calculator" className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              How much could you earn?
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              Move the sliders. See realistic numbers based on our current
              pricing and 20% commission rate.
            </p>
          </div>

          <Card className="overflow-hidden border-border bg-card shadow-xl shadow-primary/5">
            <CardContent className="p-6 sm:p-8">
              <div className="grid gap-8 lg:grid-cols-2">
                {/* Inputs */}
                <div className="space-y-8">
                  <div>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="referrals-slider"
                        className="text-sm font-medium text-foreground"
                      >
                        How many people sign up through your link each month?
                      </label>
                      <span className="text-lg font-semibold tabular-nums text-foreground">
                        {referrals}
                      </span>
                    </div>
                    <Slider
                      id="referrals-slider"
                      value={[referrals]}
                      onValueChange={(v) => setReferrals(v[0] ?? 1)}
                      min={1}
                      max={100}
                      step={1}
                      aria-label="Referrals per month"
                    />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>1</span>
                      <span>100</span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="plan-select"
                      className="mb-3 block text-sm font-medium text-foreground"
                    >
                      Which plan do they typically choose?
                    </label>
                    <Select
                      value={planId}
                      onValueChange={(v) => setPlanId(v as PlanId)}
                    >
                      <SelectTrigger
                        id="plan-select"
                        className="w-full bg-background"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLAN_OPTIONS.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="months-slider"
                        className="text-sm font-medium text-foreground"
                      >
                        How long do they stay subscribed?
                      </label>
                      <span className="text-lg font-semibold tabular-nums text-foreground">
                        {monthsStaying} {monthsStaying === 1 ? "month" : "months"}
                      </span>
                    </div>
                    <Slider
                      id="months-slider"
                      value={[monthsStaying]}
                      onValueChange={(v) => setMonthsStaying(v[0] ?? 1)}
                      min={1}
                      max={12}
                      step={1}
                      aria-label="Months staying subscribed"
                    />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>1</span>
                      <span>12</span>
                    </div>
                  </div>
                </div>

                {/* Outputs */}
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-background p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Monthly earnings at full ramp
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
                      {formatUsd(earnings.monthlyAtFullRamp)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Once all your active cohorts are paying at the same time.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-primary">
                      Year 1 total earnings
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
                      {formatUsd(earnings.year1Total)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sum of every commission paid in your first 12 months.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      2 year projection
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
                      {formatUsd(earnings.twoYearTotal)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Year 1 plus new year 2 cohorts and rolling spillover.
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-8 text-center text-sm italic text-muted-foreground">
                These numbers assume our current pricing. Conversion rates
                depend on your audience fit. Top SpyReels partners do better
                than this.
              </p>

              <div className="mt-6 flex justify-center">
                <Button asChild size="lg" className="gap-2">
                  <a
                    href={REWARDFUL_SIGNUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Lock in my partner spot
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── 3. Why SpyReels Converts Better ─── */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Why SpyReels converts better
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              Every detail of the funnel is built to put paying customers in
              your account, not on a generic AI tool page.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {REASONS.map((r) => {
              const Icon = r.icon;
              return (
                <Card
                  key={r.title}
                  className="border-border bg-card transition-colors hover:border-primary/30"
                >
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">
                      {r.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {r.body}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── 4. Commission Tier Ladder ─── */}
      <section className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Climb the commission ladder
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              Every paying referral lifts your rate. Bigger audiences earn the
              top tiers fastest.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier, idx) => {
              const Icon = tier.icon;
              const isTop = tier.id === "platinum";
              return (
                <Card
                  key={tier.id}
                  className={
                    isTop
                      ? "relative border-primary/40 bg-primary/5 shadow-lg shadow-primary/10"
                      : "border-border bg-card"
                  }
                >
                  <CardContent className="flex h-full flex-col p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Tier {idx + 1}
                      </p>
                    </div>
                    <h3 className="text-xl font-semibold text-foreground">
                      {tier.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tier.range}
                    </p>
                    <div className="my-5 rounded-xl border border-border bg-background p-4 text-center">
                      <p className="text-3xl font-bold tabular-nums text-foreground">
                        {tier.rate}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        recurring for {tier.months}
                      </p>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {tier.perks.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Active referrals means currently paying subscribers, not lifetime
            signups.
          </p>
        </div>
      </section>

      {/* ─── 5. What You Get When You Join ─── */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              What you get when you join
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              Everything you need to run a real revenue channel, not a side
              link in a bio.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PERKS.map((perk) => {
              const Icon = perk.icon;
              return (
                <Card key={perk.title} className="border-border bg-card">
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {perk.title}
                      </h3>
                      {perk.flag ? (
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-primary/5 text-[10px] uppercase tracking-wider text-primary"
                        >
                          {perk.flag}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {perk.body}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── 6. How It Works ─── */}
      <section className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              How it works
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              Three steps from application to first payout.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="relative rounded-2xl border border-border bg-card p-6"
              >
                <span className="absolute -top-3 left-6 rounded-full border border-primary/30 bg-background px-3 py-1 text-xs font-semibold tabular-nums text-primary">
                  Step {step.number}
                </span>
                <h3 className="mb-2 mt-3 text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 7. Built For These Audiences ─── */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Built for these audiences
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              If you teach creators, write for them, or sell to them, your
              audience overlaps with ours.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {AUDIENCES.map((audience) => {
              const Icon = audience.icon;
              return (
                <Card key={audience.title} className="border-border bg-card">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">
                      {audience.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {audience.body}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── 8. Launch Bonus ─── */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Card className="relative overflow-hidden border-primary/40 bg-card shadow-xl shadow-primary/10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
            <CardContent className="relative p-8 sm:p-10">
              <Badge
                variant="outline"
                className="mb-5 border-primary/40 bg-primary/10 px-3 py-1 text-xs uppercase tracking-wider text-primary"
              >
                <Sparkles className="mr-1.5 h-3 w-3" /> Launch Bonus
              </Badge>
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                First 100 partners get the Launch Bonus
              </h2>
              <p className="mb-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                $100 cash bonus once you reach 5 paid conversions. Stacks on
                top of your recurring commission. Ends 60 days from launch.
                After that, the program continues but the bonus is gone.
              </p>
              <Button
                asChild
                size="lg"
                className="h-12 gap-2 px-8 text-base shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30"
              >
                <a
                  href={REWARDFUL_SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Claim my spot
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── 9. FAQ ─── */}
      <section className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              Still wondering? Email{" "}
              <a
                href="mailto:noah.perry@spyreels.ai"
                className="text-primary underline-offset-4 hover:underline"
              >
                noah.perry@spyreels.ai
              </a>{" "}
              and we will get back to you.
            </p>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="p-2 sm:p-4">
              <Accordion type="single" collapsible className="w-full">
                {FAQ_ITEMS.map((item, idx) => (
                  <AccordionItem
                    key={item.q}
                    value={`item-${idx}`}
                    className="px-4 last:border-b-0"
                  >
                    <AccordionTrigger className="text-base font-medium text-foreground">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── 10. Final CTA ─── */}
      <section className="border-t border-border/50">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <Building2 className="mx-auto mb-6 h-10 w-10 text-primary" />
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-5xl">
            Stop scrolling. Start earning.
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            The Partner Program is open right now. Join the first 100 and lock
            in the Launch Bonus.
          </p>
          <Button
            asChild
            size="lg"
            className="h-12 gap-2 px-8 text-base shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30"
          >
            <a
              href={REWARDFUL_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Become a SpyReels Partner
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            Questions first? Reach the founder at noah.perry@spyreels.ai
          </p>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground/60 sm:px-6 lg:px-8">
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
