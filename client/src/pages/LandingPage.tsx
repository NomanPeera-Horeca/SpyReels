import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_LOGO_URL,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { getLoginUrl } from "@/const";
import { signupAttributionBody } from "@/utils/utm-capture";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import {
  Film, Search, FileText, Mic, Calendar,
  ArrowRight, Zap, Shield, Clock, ChevronDown, ChevronUp,
  Sparkles, Eye, EyeOff, BarChart3, Download, Bot, Layers,
  Check, X, Crown, Rocket, Building2, Star, BookOpen
} from "lucide-react";

const POPULAR_GUIDES = [
  {
    href: "/blog/guide-find-viral-reels-your-niche",
    title: "How to find viral Reels in your niche",
    description: "Research methods to spot winning Reels before you film.",
  },
  {
    href: "/blog/guide-spy-on-competitor-instagram-reels",
    title: "How to spy on competitor Instagram Reels",
    description: "Study rivals without guessing what is working.",
  },
  {
    href: "/blog/guide-instagram-reels-script-generator",
    title: "Instagram Reels script generator guide",
    description: "Turn viral patterns into scripts you can film today.",
  },
  {
    href: "/blog/guide-grow-instagram-reels-under-10k",
    title: "Grow Instagram Reels under 10K followers",
    description: "A realistic plan for small accounts still building reach.",
  },
  {
    href: "/blog/best-instagram-reels-tools-2026",
    title: "Best Instagram Reels tools in 2026",
    description: "Compare SpyReels, Meedro, ViralFindr, and Descript.",
  },
] as const;

const HERO_VIDEO_URL = "https://pub-059f1c24b0b4430da6a57824dd88b55e.r2.dev/landing/hero-demo-v1.mp4";
const WORKFLOW_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/hero-workflow-3tnbssSHX3vSoQBktt96Lq.webp";

// ─── Features ──────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Film,
    title: "See every Reel your competitor has ever posted",
    description: "Enter any public Instagram handle and see every Reel ranked by views, likes, engagement rate and comments. Know what is working for them before you film anything.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: Search,
    title: "Find viral Reels in your niche in seconds",
    description: "Search by keyword or paste any Reel URL. Filter by engagement rate, view count, or date. Stop scrolling for hours. Find what is working in your niche in under 60 seconds.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Mic,
    title: "Know word for word what top creators are saying",
    description: "One click transcription with timestamped segments. See the exact hook, the exact words, the exact structure that made a Reel hit 500K views. No more guessing.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Bot,
    title: "Get a ready-to-film script in under 2 minutes",
    description: "AI reverse-engineers the viral formula and rewrites it in your voice for your niche. You get a complete script with delivery cues, hook, body, and CTA. Ready to film.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: FileText,
    title: "Never lose a good idea again",
    description: "Save scripts, organize by status, schedule on a calendar. From idea to posted Reel, everything lives in one place. No more notes apps, no more lost drafts.",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
  },
  // Re-enable with App route: import Chrome from lucide-react and uncomment:
  // { icon: Chrome, title: "Sort any creator's feed...", link: "/extension" },
];

type FeatureItem = (typeof FEATURES)[number] & { link?: string };

function FeatureCard({ feature }: { feature: FeatureItem }) {
  const Icon = feature.icon;
  const card = (
    <Card
      className={`bg-card/50 border-border/50 hover:border-primary/20 transition-all duration-300 group ${feature.link ? "cursor-pointer" : ""}`}
    >
      <CardContent className="p-6">
        <div
          className={`h-11 w-11 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
        >
          <Icon className={`h-5 w-5 ${feature.color}`} />
        </div>
        <h3 className="font-semibold text-lg mb-2 text-foreground">{feature.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
        {feature.link && (
          <span className="text-xs text-primary mt-3 inline-flex items-center gap-1">
            Learn more <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </CardContent>
    </Card>
  );
  if (feature.link) {
    return (
      <a href={feature.link} className="block">
        {card}
      </a>
    );
  }
  return card;
}

// ─── How it works ──────────────────────────────────────────────
const STEPS = [
  {
    number: "01",
    title: "Pick a creator winning in your niche",
    description: "Enter their Instagram handle. SpyReels pulls every Reel they have posted, sorted by what is actually performing. You see their top 10 viral Reels in seconds.",
    icon: Eye,
  },
  {
    number: "02",
    title: "Transcribe the one that blew up",
    description: "One click. You get the full transcript with timestamps, the hook word for word, the structure, the CTA. You now know exactly why it went viral.",
    icon: BarChart3,
  },
  {
    number: "03",
    title: "Get your script and film it today",
    description: "AI takes their viral formula and writes your version. Your niche, your voice, your angle. Teleprompter included. Most creators film within an hour of getting the script.",
    icon: Sparkles,
  },
];

// ─── FAQ ───────────────────────────────────────────────────────
const FAQ = [
  {
    q: "How is this different from just manually scrolling Instagram?",
    a: "Manual scrolling shows you Reels in chronological order with no data. SpyReels shows you every Reel a creator has ever posted, sorted by views, likes, and engagement rate. You see their top performers instantly. Then you transcribe and recreate in minutes, not hours.",
  },
  {
    q: "Will Instagram ban my account for using this?",
    a: "No. SpyReels never accesses your Instagram account and does not require your login. We only read publicly available data that anyone can see by visiting a profile. Your account is completely safe.",
  },
  {
    q: "How fast can I actually get a script?",
    a: "Most users go from picking a creator to having a ready-to-film script in under 10 minutes. Research takes about 2 minutes, transcription takes about 1 minute, and AI script generation takes about 30 seconds.",
  },
  {
    q: "Do I need to be a big creator for this to work?",
    a: "This is built specifically for creators under 50K followers who are trying to grow. The strategy of studying what works and replicating it is exactly how most big creators built their audience in the first place.",
  },
  {
    q: "What if I don't like it after paying?",
    a: "Every paid plan comes with a 14-day money-back guarantee. Cancel any time with one click from your billing page. No contracts, no questions asked.",
  },
  {
    q: "Can I save money with annual billing?",
    a: "Yes. Annual plans save over 40%. Starter drops to $11 per month, Pro drops to $29 per month. You can switch to annual any time from your billing page.",
  },
];

// ═══════════════════════════════════════════════════════════════
// Landing Page
// ═══════════════════════════════════════════════════════════════
const HOME_TITLE =
  "Instagram Reels Spy Tool | Research, Transcribe, and Script | SpyReels";
const HOME_DESCRIPTION =
  "Instagram Reels spy tool for nano and micro creators. See competitor Reels ranked by views and engagement, transcribe hooks, and generate scripts in your voice. Try free.";

export default function LandingPage() {
  useCanonical("/");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    applyStandardPageMeta({
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      canonicalUrl: `${SPYREELS_SITE_URL}/`,
    });

    injectSchemaScript("home-organization-schema", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SpyReels",
      url: SPYREELS_SITE_URL,
      logo: SPYREELS_LOGO_URL,
      sameAs: [],
    });

    injectSchemaScript("home-website-schema", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "SpyReels",
      url: SPYREELS_SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SPYREELS_SITE_URL}/blog?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    });

    injectSchemaScript("home-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SpyReels",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free tier available",
      },
      description:
        "Instagram Reels spy tool with analytics, transcription, and AI script generation for nano and micro creators.",
    });

    injectSchemaScript("home-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
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
        "home-organization-schema",
        "home-website-schema",
        "home-software-schema",
        "home-faq-schema",
      ]);
    };
  }, []);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const handleGetStarted = () => {
    setShowLoginModal(true);
  };
  const handleGoogleLogin = () => {
    window.location.href = getLoginUrl();
  };
  const [authMode, setAuthMode] = useState<"login" | "signup" | "forgot">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const handleEmailAuth = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        authMode === "signup"
          ? {
              email: authEmail,
              password: authPassword,
              name: authName,
              ...signupAttributionBody(),
            }
          : { email: authEmail, password: authPassword };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Something went wrong");
      } else {
        window.location.href = "/";
      }
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };
  const handleForgotPassword = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail }),
      });
      if (res.ok) {
        setAuthError("Reset link sent! Check your email.");
      } else {
        setAuthError("Email not found.");
      }
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">Welcome to SpyReels</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2 w-full">
            <p className="text-center text-muted-foreground text-sm">Spy on viral Reels. Steal the script. Own the feed.</p>
            <button
              onClick={handleGoogleLogin}
              className="flex items-center gap-3 w-full justify-center px-6 py-3 border border-border rounded-lg hover:bg-accent transition-colors font-medium"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              Continue with Google
            </button>
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex w-full gap-2 mb-1">
              <button
                onClick={() => setAuthMode("login")}
                className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${authMode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Log In
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${authMode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Sign Up
              </button>
            </div>
            {authMode === "signup" && (
              <input type="text" placeholder="Your name" value={authName} onChange={e => setAuthName(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            )}
            <input type="email" placeholder="Email address" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="relative w-full">
              <input
                type={showAuthPassword ? "text" : "password"}
                placeholder="Password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowAuthPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md"
                aria-label={showAuthPassword ? "Hide password" : "Show password"}
              >
                {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {authError && <p className="text-xs text-red-500 w-full">{authError}</p>}
            <button onClick={handleEmailAuth} disabled={authLoading} className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
              {authLoading ? "Please wait..." : authMode === "login" ? "Log In" : "Create Account"}
            </button>
            {authMode === "login" && (
              <button onClick={() => setAuthMode("forgot")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Forgot password?</button>
            )}
            {authMode === "forgot" && (
              <div className="w-full flex flex-col gap-3">
                <input type="email" placeholder="Enter your email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <button onClick={handleForgotPassword} className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90">Send Reset Link</button>
                <button onClick={() => setAuthMode("login")} className="text-xs text-muted-foreground hover:text-foreground">Back to Login</button>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">Free to start. No credit card required.</p>
          </div>
        </DialogContent>
      </Dialog>

      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-12">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            {/* Left: Copy + CTAs */}
            <div className="text-center lg:text-left">
              <Badge variant="outline" className="mb-6 text-primary border-primary/30 px-4 py-1.5 text-sm">
                <Star className="h-3.5 w-3.5 mr-2" />
                12,000+ creators are already using SpyReels
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                The Instagram Reels spy tool for creators who ask: why are their Reels getting{" "}
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
                  100K views and yours get 200?
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mb-4 leading-relaxed mx-auto lg:mx-0 max-w-2xl lg:max-w-xl">
                SpyReels ranks competitor Reels by performance, transcribes them word for word, and writes you a ready-to-film script based on the same formula. Most creators go from research to filming in under 10 minutes.
              </p>
              <p className="text-sm text-amber-400 font-medium mb-8">
                While you are reading this, other creators in your niche are already using this.
              </p>
              <div className="flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-4 mb-6">
                <Button size="lg" onClick={handleGetStarted} className="text-base px-8 h-12 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
                  Start Free. No Credit Card.
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                  See how it works <ChevronDown className="h-4 w-4" />
                </a>
              </div>
              <p className="text-xs text-muted-foreground/70">Free plan includes 2 account research sessions, 3 transcriptions, and 5 saved scripts per month</p>
              <p className="mt-4 text-sm text-muted-foreground">
                <Link href="/pricing" className="text-primary hover:underline">
                  See SpyReels pricing
                </Link>
                {" · "}
                <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
                  Try our free viral hook generator
                </Link>
                {" · "}
                <Link href="/blog" className="text-primary hover:underline">
                  Read our Instagram growth blog
                </Link>
                {" · "}
                <Link href="/affiliate" className="text-primary hover:underline">
                  Join the SpyReels affiliate program
                </Link>
              </p>
            </div>

            {/* Right: Hero demo video (9:16 vertical) */}
            <div className="relative mx-auto w-full max-w-[340px]">
              <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent rounded-3xl blur-2xl pointer-events-none" />
              <div className="relative rounded-2xl border border-border/50 overflow-hidden shadow-2xl shadow-primary/20 bg-card">
                <video
                  src={HERO_VIDEO_URL}
                  className="block w-full h-auto aspect-[9/16] object-cover"
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
            </div>
          </div>

          {/* Social proof bar */}
          <div className="mt-12 sm:mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            {[
              { icon: Star, text: "12,000+ creators" },
              { icon: Film, text: "2.4M+ Reels analyzed" },
              { icon: FileText, text: "180,000+ scripts generated" },
              { icon: Clock, text: "Avg 9 min from research to script" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2">
                <item.icon className="h-4 w-4 text-primary" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain point section */}
      <section className="border-y border-border/50 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-center text-sm text-muted-foreground mb-8 uppercase tracking-wider font-medium">The difference between creators who grow and creators who don't</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <X className="h-5 w-5 text-red-400" />
                <span className="font-semibold text-foreground">Without SpyReels</span>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />Spend 3 hours scrolling for content ideas</li>
                <li className="flex items-start gap-2"><X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />Post and hope the algorithm picks it up</li>
                <li className="flex items-start gap-2"><X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />No idea why some Reels go viral and yours don't</li>
                <li className="flex items-start gap-2"><X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />Manually transcribe videos to study the script</li>
                <li className="flex items-start gap-2"><X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />Write scripts from scratch every single time</li>
              </ul>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Check className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-foreground">With SpyReels</span>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />See every viral Reel in your niche in 60 seconds</li>
                <li className="flex items-start gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />Know exactly what works before you film anything</li>
                <li className="flex items-start gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />Transcribe any Reel in one click, word for word</li>
                <li className="flex items-start gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />Get a ready-to-film script in under 2 minutes</li>
                <li className="flex items-start gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />Post with confidence knowing the formula works</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Popular guides (internal links for blog hub pages) */}
      <section id="popular-guides" className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-primary mb-3">
              <BookOpen className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Free guides</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
              Popular Instagram Reels guides
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Step-by-step playbooks on finding viral Reels, writing scripts, and growing under 10K followers.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {POPULAR_GUIDES.map((guide) => (
              <Link key={guide.href} href={guide.href} className="group block h-full">
                <Card className="h-full bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                  <CardContent className="p-5">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-2 leading-snug">
                      {guide.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{guide.description}</p>
                    <span className="text-xs text-primary mt-3 inline-flex items-center gap-1">
                      Read guide <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <p className="text-center mt-8 text-sm text-muted-foreground">
            <Link href="/blog" className="text-primary hover:underline">
              View all blog posts
            </Link>
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1">
              What creators are saying
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Real creators. Real results.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Creators in every niche are using SpyReels to study what works and grow faster.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                initials: "MT",
                name: "Marcus T.",
                niche: "Fitness and nutrition creator",
                followers: "14K followers",
                color: "bg-purple-500/20 text-purple-400",
                quote: "I typed in a fitness creator with 2M followers and saw their top 10 Reels instantly. Transcribed the one with 800K views, got my script, filmed it the same day. That Reel got 34K views. My previous best was 1,200.",
              },
              {
                initials: "PS",
                name: "Priya S.",
                niche: "Food and recipe creator",
                followers: "28K followers",
                color: "bg-amber-500/20 text-amber-400",
                quote: "I spent months trying to figure out why my recipes never got traction. SpyReels showed me in 5 minutes that short punchy hooks with a surprise ending were getting all the views in my niche. Game changer.",
              },
              {
                initials: "DR",
                name: "Daniel R.",
                niche: "Real estate creator",
                followers: "9K followers",
                color: "bg-blue-500/20 text-blue-400",
                quote: "As a real estate agent trying to grow on Instagram, I had no idea what content worked. SpyReels showed me every top performing Reel in my niche. I went from 400 views to 22K on my next video.",
              },
              {
                initials: "AM",
                name: "Aisha M.",
                niche: "Personal finance creator",
                followers: "41K followers",
                color: "bg-emerald-500/20 text-emerald-400",
                quote: "I used to spend 4 hours every Sunday researching content ideas. Now I spend 15 minutes on SpyReels and have a full week of scripts ready to film. It is not even close.",
              },
              {
                initials: "JK",
                name: "Jordan K.",
                niche: "Lifestyle and mindset creator",
                followers: "19K followers",
                color: "bg-pink-500/20 text-pink-400",
                quote: "Every big creator I looked up to was clearly using some kind of system. SpyReels is that system. I finally understand what makes content go viral and I can replicate it every single week.",
              },
              {
                initials: "LB",
                name: "Lauren B.",
                niche: "Beauty and skincare creator",
                followers: "33K followers",
                color: "bg-cyan-500/20 text-cyan-400",
                quote: "I found 3 viral Reels in my niche, transcribed them all in under 10 minutes, and had scripts for my entire week done before lunch. I have not missed a posting day since I started using SpyReels.",
              },
            ].map((t) => (
              <Card key={t.name} className="bg-card/50 border-border/50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full ${t.color} flex items-center justify-center font-semibold text-sm shrink-0`}>
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.niche} · {t.followers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1">Everything you need to go viral</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Stop guessing. Start knowing.</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Every feature is built around one goal: getting you from zero ideas to ready-to-film script as fast as possible.
            </p>
          </div>
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.slice(0, 3).map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </div>
            <div className="flex w-full justify-center">
              <div className="grid w-full max-w-4xl grid-cols-1 sm:grid-cols-2 gap-6">
                {FEATURES.slice(3, 5).map((feature) => (
                  <FeatureCard key={feature.title} feature={feature} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-card/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1">Simple 3-step workflow</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">From zero ideas to ready-to-film in 10 minutes</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No more hours scrolling for inspiration. This is the workflow top creators wish they had when they started.
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
                    <span className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{step.number}</span>
                  </div>
                  <h3 className="font-semibold text-xl mb-3 text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="relative rounded-xl border border-border/50 overflow-hidden shadow-2xl shadow-primary/10 max-w-5xl mx-auto">
            <img src={WORKFLOW_IMG} alt="SpyReels workflow" className="w-full" loading="lazy" />
          </div>
        </div>
      </section>

      {/* The real reason section */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-pink-500/10 to-amber-500/10 rounded-2xl blur-xl" />
            <Card className="relative bg-card border-border/50">
              <CardContent className="p-8 sm:p-12">
                <Badge variant="outline" className="mb-6 text-primary border-primary/30 px-3 py-1">The truth about going viral</Badge>
                <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-foreground">
                  The creators winning on Instagram are not more talented than you.
                </h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>They just know what works before they hit record. They study what is already going viral in their niche, they understand why it worked, and they create their version. That is the entire strategy.</p>
                  <p>SpyReels gives you that exact intelligence in minutes. See what is going viral, transcribe it, understand the formula, get a script. The creators doing this consistently are the ones growing consistently.</p>
                  <p className="text-foreground font-medium">The ones not doing it are posting into the void and wondering why nothing works.</p>
                </div>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Button onClick={handleGetStarted} className="shadow-lg shadow-primary/25">
                    Start for Free <ArrowRight className="h-4 w-4 ml-2" />
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

      {/* Trust signals */}
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

      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Questions? We have answers.</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <div key={i} className="border border-border/50 rounded-lg overflow-hidden">
                <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left hover:bg-card/50 transition-colors">
                  <span className="font-medium text-foreground pr-4">{item.q}</span>
                  {expandedFaq === i ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
                {expandedFaq === i && <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-pink-500/5 to-amber-500/10 rounded-3xl blur-2xl" />
            <div className="relative bg-card border border-border/50 rounded-2xl p-10 sm:p-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
                Your competitors are already using this.
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
                Every day you wait is another day they study what works and you guess. Start free in 30 seconds.
              </p>
              <Button size="lg" onClick={handleGetStarted} className="text-base px-10 h-13 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
                Start Free Now
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <p className="text-xs text-muted-foreground/70 mt-4">No credit card required. Free plan available forever.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}
