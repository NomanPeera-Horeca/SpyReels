import { useState } from "react";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Film, Search, FileText, Mic, Calendar, Chrome,
  ArrowRight, Zap, Shield, Clock, ChevronDown, ChevronUp,
  Sparkles, Eye, BarChart3, Download, Bot, Layers,
  Check, X, Crown, Rocket, Building2, Star
} from "lucide-react";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/hero-dashboard-EWAcrdvhz9tvRSUdzj7WCo.webp";
const WORKFLOW_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/hero-workflow-3tnbssSHX3vSoQBktt96Lq.webp";
const SPYREELS_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

// ─── Features ──────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Film,
    title: "Spy on Any Creator's Reels",
    description: "Enter any public Instagram handle and spy on all their Reels — views, likes, comments, and engagement rates. See exactly what's working for them.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: Search,
    title: "Hunt by Keyword or URL",
    description: "Hunt down viral Reels by topic, paste direct URLs, or infiltrate any creator's content. Discover winning formats in your niche.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Mic,
    title: "Decode Their Exact Words",
    description: "Transcribe any Reel instantly with timestamped segments. Decode exactly what top creators are saying, word for word.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Bot,
    title: "Clone the Viral Formula",
    description: "Turn any viral transcript into your own original script. The AI reverse-engineers the hook, structure, and CTA — then rewrites it in your voice.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: FileText,
    title: "Script Library & Calendar",
    description: "Save, tag, and organize scripts with Kanban boards and calendar views. Track every script from draft to posted.",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
  },
  {
    icon: Chrome,
    title: "Chrome Extension",
    description: "Sort any creator's feed by engagement, transcribe Reels, and save content — all without leaving Instagram.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    link: "/extension",
  },
];

// ─── How it works ──────────────────────────────────────────────
const STEPS = [
  {
    number: "01",
    title: "Spy on Viral Content",
    description: "Spy on a creator's Reels, search by keyword, or paste URLs. Sort by views, likes, or engagement rate to uncover what's actually going viral.",
    icon: Eye,
  },
  {
    number: "02",
    title: "Decode & Analyze",
    description: "One click to transcribe any Reel. Decode the exact words, timing, and structure that made it perform. Identify hooks, body patterns, and CTAs.",
    icon: BarChart3,
  },
  {
    number: "03",
    title: "Re-Create & Publish",
    description: "AI generates your own original script based on the viral structure. Adjust grade level, duration, and delivery cues. Save to your calendar and film.",
    icon: Sparkles,
  },
];

// ─── Pricing preview ───────────────────────────────────────────
const PRICING_PREVIEW = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Try everything. No credit card.",
    icon: Zap,
    color: "text-zinc-400",
    highlights: ["2 handle scrapes/month", "3 transcriptions/month", "5 saved scripts", "Chrome extension basics"],
  },
  {
    name: "Starter",
    price: "$19",
    period: "/mo",
    yearlyPrice: "$11",
    description: "For creators getting serious.",
    icon: Rocket,
    color: "text-blue-400",
    highlights: ["10 scrapes/month", "30 transcriptions/month", "15 AI re-creations", "CSV & Google Sheets export"],
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    yearlyPrice: "$29",
    description: "The full content machine.",
    icon: Crown,
    color: "text-purple-400",
    highlighted: true,
    highlights: ["50 scrapes/month", "200 transcriptions/month", "100 AI re-creations", "Voice teleprompter & smart takes"],
  },
  {
    name: "Business",
    price: "$99",
    period: "/mo",
    yearlyPrice: "$59",
    description: "For teams and agencies.",
    icon: Building2,
    color: "text-amber-400",
    highlights: ["200 scrapes/month", "1,000 transcriptions/month", "500 AI re-creations", "10 team members + API access"],
  },
];

// ─── FAQ ───────────────────────────────────────────────────────
const FAQ = [
  {
    q: "Is this really free to start?",
    a: "Yes. The Free plan gives you 2 handle scrapes, 3 transcriptions, and 5 saved scripts per month. No credit card required. Use it as long as you want — we'd rather you try it and decide for yourself.",
  },
  {
    q: "How is SpyReels different from SortFeed or Flick?",
    a: "Most tools stop at analytics. SpyReels goes further: spy on any creator's Reels, transcribe them, then AI reverse-engineers the viral structure into your own original script with delivery cues. It's intelligence + creation in one tool.",
  },
  {
    q: "Will this get my Instagram account banned?",
    a: "No. We don't access your Instagram account or require your login. We only read publicly available data — the same information anyone can see by visiting a profile.",
  },
  {
    q: "What if I don't like it?",
    a: "Every paid plan comes with a 14-day money-back guarantee. Cancel anytime with one click. No contracts, no hidden fees, no questions asked.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. Upgrade instantly and get prorated credit. Downgrade takes effect at the end of your billing cycle. Your scripts and data are always safe.",
  },
  {
    q: "Do you offer annual billing?",
    a: "Yes — save over 40% with annual plans. Starter drops to $11/mo, Pro to $29/mo. It's the best deal, and you can switch to annual anytime from your billing page.",
  },
];

// ═══════════════════════════════════════════════════════════════
// Landing Page
// ═══════════════════════════════════════════════════════════════
export default function LandingPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [isAnnual, setIsAnnual] = useState(true);

  const handleGetStarted = () => {
    window.location.href = getLoginUrl();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Navigation ─── */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src={SPYREELS_LOGO} alt="SpyReels" className="h-9 w-9" />
              <span className="font-semibold text-lg tracking-tight">SpyReels</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
              <a href="/extension" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"><Chrome className="h-3.5 w-3.5" />Extension</a>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleGetStarted} className="bg-transparent">
                Log In
              </Button>
              <Button size="sm" onClick={handleGetStarted}>
                Start Free <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-12">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="outline" className="mb-6 text-primary border-primary/30 px-4 py-1.5 text-sm">
              <Zap className="h-3.5 w-3.5 mr-2" />
              Free to start — no credit card required
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Spy on What's Going Viral.{" "}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
                Steal the Script. Own the Feed.
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              Spy on any creator's top-performing Reels, transcribe them in one click, and let AI reverse-engineer the viral formula into your own original script. Intelligence to ready-to-film in minutes.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Button size="lg" onClick={handleGetStarted} className="text-base px-8 h-12 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
                Start Free — No Credit Card
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                See how it works <ChevronDown className="h-4 w-4" />
              </a>
            </div>

            <p className="text-xs text-muted-foreground/70">
              Free plan includes 2 scrapes, 3 transcriptions, and 5 saved scripts per month
            </p>
          </div>

          {/* Product screenshot */}
          <div className="mt-12 sm:mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative rounded-xl border border-border/50 overflow-hidden shadow-2xl shadow-primary/10">
              <img
                src={HERO_IMG}
                alt="SpyReels — scrape, analyze, and re-create viral Instagram content"
                className="w-full"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── What You Get (value props bar) ─── */}
      <section className="border-y border-border/50 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: Eye, label: "Spy on any public profile", sub: "Views, likes, comments, engagement" },
              { icon: Mic, label: "Transcribe in one click", sub: "Timestamped segments + hook analysis" },
              { icon: Bot, label: "AI re-creates scripts", sub: "Their viral formula, your voice" },
              { icon: Calendar, label: "Plan & publish", sub: "Calendar, Kanban, teleprompter" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1">
              Your content intelligence toolkit
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              From Spying to Ready-to-Film
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              One tool replaces your entire content research workflow. Spy on what's viral, decode why it works, and create your version.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => {
              const cardContent = (
                <Card key={feature.title} className={`bg-card/50 border-border/50 hover:border-primary/20 transition-all duration-300 group ${'link' in feature ? 'cursor-pointer' : ''}`}>
                  <CardContent className="p-6">
                    <div className={`h-11 w-11 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <feature.icon className={`h-5 w-5 ${feature.color}`} />
                    </div>
                    <h3 className="font-semibold text-lg mb-2 text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                    {'link' in feature && (
                      <span className="text-xs text-primary mt-3 inline-flex items-center gap-1">Learn more <ArrowRight className="h-3 w-3" /></span>
                    )}
                  </CardContent>
                </Card>
              );
              if ('link' in feature && feature.link) {
                return <a key={feature.title} href={feature.link}>{cardContent}</a>;
              }
              return cardContent;
            })}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-card/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1">
              Simple 3-step workflow
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Viral Content in 3 Steps
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No more hours scrolling for inspiration. Go from "I need content" to "ready to film" in minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[calc(50%+40px)] w-[calc(100%-80px)] h-px bg-gradient-to-r from-primary/30 to-transparent" />
                )}
                <div className="text-center">
                  <div className="relative inline-flex items-center justify-center mb-6">
                    <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                      <step.icon className="h-8 w-8 text-primary" />
                    </div>
                    <span className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="font-semibold text-xl mb-3 text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Workflow screenshot */}
          <div className="relative rounded-xl border border-border/50 overflow-hidden shadow-2xl shadow-primary/10 max-w-5xl mx-auto">
            <img
              src={WORKFLOW_IMG}
              alt="AI script re-creation workflow — transcript to original script with delivery cues"
              className="w-full"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* ─── Founder's Note / Why We Built This ─── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-pink-500/10 to-amber-500/10 rounded-2xl blur-xl" />
            <Card className="relative bg-card border-border/50">
              <CardContent className="p-8 sm:p-12">
                <Badge variant="outline" className="mb-6 text-primary border-primary/30 px-3 py-1">
                  Why we built this
                </Badge>
                <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-foreground">
                  We got tired of the manual grind too.
                </h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    Every creator knows the drill: scroll through Instagram for hours, screenshot Reels that perform well, manually transcribe them, try to figure out what made them work, then somehow write your own version. It takes forever.
                  </p>
                  <p>
                    We built SpyReels because we wanted one tool that does the entire workflow — from finding viral content to having a ready-to-film script in your hands. No more switching between 5 different apps. No more guessing.
                  </p>
                  <p>
                    <span className="text-foreground font-medium">We're a new tool, and we're being upfront about that.</span> That means you get something most established tools won't give you: direct access to the team building it. Every feature request gets read. Every bug gets fixed fast. And our launch pricing is locked in for early adopters — it won't stay this low.
                  </p>
                </div>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Button onClick={handleGetStarted} className="shadow-lg shadow-primary/25">
                    Try It Free <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span>14-day money-back guarantee on all paid plans</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── Early Adopter Advantage ─── */}
      <section className="py-16 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">
              Why Early Adopters Win
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Getting in early on a tool isn't a risk — it's an advantage.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: Sparkles,
                title: "Lock In Launch Pricing",
                description: "Prices will increase as we add features. Sign up now and your rate stays the same — forever. Annual plans save over 40%.",
              },
              {
                icon: Layers,
                title: "Shape the Product",
                description: "Early users get direct input on what we build next. Your feature requests go to the top of the list. This is your tool as much as ours.",
              },
              {
                icon: Clock,
                title: "First-Mover Content Edge",
                description: "While others are still manually researching, you'll have AI-generated scripts ready to film. Speed is the ultimate competitive advantage.",
              },
            ].map((item) => (
              <Card key={item.title} className="bg-card/50 border-border/50 text-center">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2 text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing Preview ─── */}
      <section id="pricing" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1">
              Simple, transparent pricing
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Start Free. Upgrade When You're Ready.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
              No tricks, no hidden fees. The free plan is genuinely useful — upgrade only when you need more.
            </p>

            {/* Annual toggle */}
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className={`text-sm ${!isAnnual ? "text-foreground font-medium" : "text-muted-foreground"}`}>Monthly</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className={`relative h-7 w-12 rounded-full transition-colors ${isAnnual ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${isAnnual ? "translate-x-5.5" : "translate-x-0.5"}`} />
              </button>
              <span className={`text-sm ${isAnnual ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                Annual
              </span>
              {isAnnual && (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                  Save 40%+
                </Badge>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {PRICING_PREVIEW.map((plan) => (
              <Card
                key={plan.name}
                className={`relative bg-card/50 border-border/50 ${
                  plan.highlighted ? "ring-2 ring-primary/40 bg-gradient-to-b from-primary/5 to-transparent" : ""
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-3">Most Popular</Badge>
                  </div>
                )}
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <plan.icon className={`h-5 w-5 ${plan.color}`} />
                    <h3 className="font-semibold text-foreground">{plan.name}</h3>
                  </div>

                  <div className="mb-1">
                    <span className="text-3xl font-bold text-foreground">
                      {plan.price === "$0" ? "$0" : isAnnual && plan.yearlyPrice ? plan.yearlyPrice : plan.price}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {plan.price === "$0" ? "" : "/mo"}
                    </span>
                  </div>
                  {isAnnual && plan.yearlyPrice && (
                    <p className="text-xs text-muted-foreground mb-4">
                      <span className="line-through">{plan.price}/mo</span>{" "}
                      <span className="text-emerald-400">billed annually</span>
                    </p>
                  )}
                  {plan.price === "$0" && <p className="text-xs text-muted-foreground mb-4">{plan.period}</p>}

                  <p className="text-sm text-muted-foreground mb-5">{plan.description}</p>

                  <Button
                    onClick={handleGetStarted}
                    variant={plan.highlighted ? "default" : "outline"}
                    className={`w-full mb-5 ${plan.highlighted ? "shadow-lg shadow-primary/25" : "bg-transparent"}`}
                    size="sm"
                  >
                    {plan.price === "$0" ? "Start Free" : "Get Started"}
                  </Button>

                  <ul className="space-y-2.5">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Need more? We also offer{" "}
              <span className="text-foreground font-medium">Agency plans</span>{" "}
              with unlimited everything, 25 team members, and white-label options.{" "}
              <button onClick={handleGetStarted} className="text-primary hover:underline">
                View full comparison
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ─── Trust Signals ─── */}
      <section className="py-12 border-y border-border/50 bg-card/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { icon: Shield, text: "14-day money-back guarantee" },
              { icon: Clock, text: "Cancel anytime, no contracts" },
              { icon: Zap, text: "Free plan, no credit card" },
              { icon: Download, text: "Export all your data anytime" },
            ].map((item) => (
              <div key={item.text} className="flex flex-col items-center gap-2">
                <item.icon className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Questions? We've Got Answers.
            </h2>
          </div>

          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <div key={i} className="border border-border/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-card/50 transition-colors"
                >
                  <span className="font-medium text-foreground pr-4">{item.q}</span>
                  {expandedFaq === i ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {expandedFaq === i && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-pink-500/5 to-amber-500/10 rounded-3xl blur-2xl" />
            <div className="relative bg-card border border-border/50 rounded-2xl p-10 sm:p-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
                Your Next Viral Reel Starts With Intelligence
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
                Join for free. Spy on your first creator. Decode a viral Reel. See for yourself why this changes everything.
              </p>
              <Button size="lg" onClick={handleGetStarted} className="text-base px-10 h-13 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
                Start Free — Takes 30 Seconds
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <p className="text-xs text-muted-foreground/70 mt-4">
                No credit card required. Free plan available forever.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src={SPYREELS_LOGO} alt="SpyReels" className="h-8 w-8" />
              <span className="font-semibold tracking-tight">SpyReels</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
              <a href="/extension" className="hover:text-foreground transition-colors">Chrome Extension</a>
              <a href="/blog" className="hover:text-foreground transition-colors">Blog</a>
              <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
              <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            </div>
            <p className="text-xs text-muted-foreground/60">
              &copy; {new Date().getFullYear()} SpyReels. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
