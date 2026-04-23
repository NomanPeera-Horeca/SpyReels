import { ArrowRight, Zap, Download, Sparkles, CheckCircle2, X } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useState, useEffect } from "react";

/**
 * Inline CTA Banner — inserted mid-article to capture attention
 * Variant A: Gradient with bold text
 */
export function InlineCTA({ variant = "default" }: { variant?: "default" | "spy" | "script" }) {
  const configs = {
    default: {
      icon: <Zap className="h-5 w-5" />,
      headline: "Stop guessing. Start spying.",
      description: "Scrape any public Instagram account's Reels, get transcripts, and generate viral scripts with AI.",
      cta: "Try SpyReels Free",
    },
    spy: {
      icon: <Sparkles className="h-5 w-5" />,
      headline: "See what your competitors are doing, in seconds.",
      description: "Enter any Instagram handle and instantly get their Reels data, engagement metrics, and full transcripts.",
      cta: "Spy on Competitors Free",
    },
    script: {
      icon: <Sparkles className="h-5 w-5" />,
      headline: "Let AI write your next viral script.",
      description: "SpyReels analyzes top-performing Reels and generates scroll-stopping scripts tailored to your niche.",
      cta: "Generate Scripts Free",
    },
  };

  const config = configs[variant];

  return (
    <div className="my-10 relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-8">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="relative">
        <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-2">
          {config.icon}
          <span>SPYREELS</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
          {config.headline}
        </h3>
        <p className="text-muted-foreground mb-5 max-w-lg">
          {config.description}
        </p>
        <a
          href={getLoginUrl()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:gap-3 shadow-lg shadow-primary/25"
        >
          {config.cta} <ArrowRight className="h-4 w-4" />
        </a>
        <p className="text-xs text-muted-foreground/60 mt-3">Free plan available. No credit card required.</p>
      </div>
    </div>
  );
}

/**
 * Lead Magnet Section — appears near the end of articles
 * Offers a free downloadable resource in exchange for signing up
 */
export function LeadMagnet({ type = "template" }: { type?: "template" | "checklist" | "guide" }) {
  const configs = {
    template: {
      badge: "FREE TEMPLATE",
      title: "Viral Reel Script Template",
      description: "Download our proven 4-part script framework used by creators with 1M+ followers. Includes 10 fill-in-the-blank templates for different niches.",
      bullets: [
        "Hook formulas that stop the scroll",
        "Story structure for maximum retention",
        "CTA templates that drive action",
        "10 niche-specific script examples",
      ],
    },
    checklist: {
      badge: "FREE CHECKLIST",
      title: "Instagram Reels Optimization Checklist",
      description: "The complete 25-point checklist to maximize your Reel's reach, engagement, and conversion rate before you hit publish.",
      bullets: [
        "Pre-publish optimization steps",
        "Hashtag strategy framework",
        "Best posting times by niche",
        "Engagement boosting tactics",
      ],
    },
    guide: {
      badge: "FREE GUIDE",
      title: "Competitor Analysis Playbook",
      description: "Learn exactly how to reverse-engineer your competitors' best-performing Reels and create your own viral content.",
      bullets: [
        "What metrics actually matter",
        "How to identify winning patterns",
        "Script analysis framework",
        "Content calendar template",
      ],
    },
  };

  const config = configs[type];

  return (
    <div className="my-12 rounded-2xl border border-border/50 bg-card/80 overflow-hidden">
      <div className="bg-gradient-to-r from-primary/20 to-primary/5 px-6 py-3">
        <span className="text-xs font-bold tracking-wider text-primary flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5" /> {config.badge}
        </span>
      </div>
      <div className="p-6 sm:p-8">
        <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-3">
          {config.title}
        </h3>
        <p className="text-muted-foreground mb-5">
          {config.description}
        </p>
        <ul className="space-y-2.5 mb-6">
          {config.bullets.map((bullet, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <a
          href={getLoginUrl()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 w-full sm:w-auto justify-center sm:justify-start"
        >
          Sign Up Free to Download <ArrowRight className="h-4 w-4" />
        </a>
        <p className="text-xs text-muted-foreground/60 mt-3">
          Instant access after free signup. No credit card needed.
        </p>
      </div>
    </div>
  );
}

/**
 * Sticky Bottom CTA Bar — appears after scrolling past the fold
 * Dismissible, non-intrusive conversion prompt
 */
export function StickySignupBar() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    const handleScroll = () => {
      // Show after scrolling 40% of the page
      const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      setVisible(scrollPercent > 0.3);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [dismissed]);

  if (dismissed || !visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card/95 backdrop-blur-xl border-t border-primary/20 shadow-2xl shadow-black/40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-9 w-9 rounded-lg bg-primary/10 items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                Ready to spy on viral Reels?
              </p>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Join 12,000+ creators using SpyReels to reverse-engineer viral content.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={getLoginUrl()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all whitespace-nowrap"
            >
              Start Free <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Social Proof Banner — shows user count and trust signals
 */
export function SocialProofBanner() {
  return (
    <div className="my-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
      <span>
        Trusted by <strong className="text-foreground">12,000+</strong> creators
      </span>
      <span className="text-border/70">·</span>
      <span>
        Analyzed <strong className="text-foreground">500K+</strong> Reels
      </span>
      <span className="text-border/70">·</span>
      <span>
        <strong className="text-foreground">Free</strong> plan available
      </span>
    </div>
  );
}
