import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { AuthDialog } from "@/components/AuthDialog";
import { trpc } from "@/lib/trpc";
import { authHeadlineBrollGenerate } from "@/lib/authHeadlines";
import type { BrollLandingMatch } from "@shared/brollLanding";
import { DemoWidget } from "@/components/brollLanding/DemoWidget";
import { PricingModal } from "@/components/brollLanding/PricingModal";
import { useScrollReveal } from "@/components/brollLanding/useScrollReveal";
import {
  BROLL_LANDING_DESCRIPTION,
  BROLL_LANDING_FAQ,
  BROLL_LANDING_OG_DESCRIPTION,
  BROLL_LANDING_TITLE,
} from "@/components/brollLanding/brollLandingCopy";
import {
  ComparisonTable,
  Faq,
  FinalCta,
  HowItWorks,
  InputModes,
  SampleGallery,
  SocialProof,
  UseCaseGrid,
  WhyBroll,
} from "@/components/brollLanding/StaticSections";
import "@/components/brollLanding/brollLanding.css";

const BROLL_PATH = "/free-tools/broll-generator";
const BROLL_CANONICAL = `${SPYREELS_SITE_URL}${BROLL_PATH}`;

export default function BrollGenerator() {
  const { isAuthenticated } = useAuth();
  useCanonical(BROLL_PATH);
  useScrollReveal();

  const [authOpen, setAuthOpen] = useState(false);
  const [authHeadline, setAuthHeadline] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const quotaQuery = trpc.brollLanding.quota.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const checkoutMutation = trpc.billing.checkout.useMutation();
  const downloadMutation = trpc.brollLanding.downloadClips.useMutation();

  useEffect(() => {
    if (quotaQuery.data) {
      setRemaining(quotaQuery.data.remaining);
    }
  }, [quotaQuery.data]);

  useEffect(() => {
    applyStandardPageMeta({
      title: BROLL_LANDING_TITLE,
      description: BROLL_LANDING_DESCRIPTION,
      canonicalUrl: BROLL_CANONICAL,
      ogDescription: BROLL_LANDING_OG_DESCRIPTION,
    });

    injectSchemaScript("broll-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SPYREELS_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Free Tools",
          item: `${SPYREELS_SITE_URL}/free-tools`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Free AI B-Roll Generator",
          item: BROLL_CANONICAL,
        },
      ],
    });

    injectSchemaScript("broll-software-schema", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Free AI B-Roll Generator",
      url: BROLL_CANONICAL,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      description:
        "Paste your script, or upload footage you've already shot. SpyReels matches every beat to real footage automatically and turns it into a fully B-rolled video. Free preview requires no signup; signup unlocks saving and watermark removal; payment unlocks full-resolution download.",
      offers: [
        {
          "@type": "Offer",
          name: "Free Preview",
          price: "0",
          priceCurrency: "USD",
          description:
            "Generate a watermarked preview with no signup required. Full resolution, no duration cap.",
        },
        {
          "@type": "Offer",
          name: "Full Download",
          priceCurrency: "USD",
          description:
            "Full-resolution, watermark-free download after account signup and payment.",
        },
      ],
    });

    injectSchemaScript("broll-faq-schema", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: BROLL_LANDING_FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });

    injectSchemaScript("broll-howto-schema", {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How to generate B-roll with SpyReels",
      description:
        "Paste your script, or upload footage you've already shot. SpyReels matches every beat to real footage automatically using the free AI B-roll generator.",
      step: [
        {
          "@type": "HowToStep",
          name: "Paste your script or upload your video",
          text: "Drop in a script you've written, or upload a talking-head video you've already filmed.",
        },
        {
          "@type": "HowToStep",
          name: "AI splits it into visual beats",
          text: "SpyReels reads your script or transcript and breaks it into the specific moments that need a visual, in a single AI pass.",
        },
        {
          "@type": "HowToStep",
          name: "Each beat gets matched B-roll",
          text: "Every beat is matched to real stock footage or an original AI-generated clip, picked for the exact words being said.",
        },
        {
          "@type": "HowToStep",
          name: "Preview instantly, download when ready",
          text: "Watch your watermarked preview immediately with no account. Sign up free to save your project and remove the watermark. Pay only to download full-resolution files.",
        },
      ],
    });

    return () => {
      cleanupSchemaScripts([
        "broll-breadcrumb-schema",
        "broll-software-schema",
        "broll-faq-schema",
        "broll-howto-schema",
      ]);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPricingOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function openSignup() {
    setAuthHeadline(authHeadlineBrollGenerate());
    setAuthOpen(true);
  }

  function handleDownloadLocked() {
    if (!isAuthenticated) {
      openSignup();
      return;
    }
    setPricingOpen(true);
  }

  async function handleDownloadUnlocked(matches: BrollLandingMatch[]) {
    try {
      const result = await downloadMutation.mutateAsync({ matches });
      for (const clip of result.clips) {
        window.open(clip.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setPricingOpen(true);
    }
  }

  async function handleSeePlans() {
    if (!isAuthenticated) {
      setPricingOpen(false);
      openSignup();
      return;
    }
    try {
      const { url } = await checkoutMutation.mutateAsync({
        planId: "starter",
        interval: "monthly",
        origin: window.location.origin,
      });
      if (url) window.location.href = url;
    } catch {
      window.location.href = "/pricing";
    }
  }

  const watermarked = quotaQuery.data?.watermarked ?? !isAuthenticated;
  const canDownload = quotaQuery.data?.canDownload ?? false;

  return (
    <div className="broll-landing min-h-screen bg-white text-zinc-900">
      <PublicHeader />

      <main>
        <section className="relative overflow-hidden bg-[#0a0a0f] pb-20 pt-16 text-white lg:pb-28 lg:pt-24">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/25 blur-[140px]" />
          <div className="pointer-events-none absolute -bottom-56 right-[-120px] h-[420px] w-[620px] rounded-full bg-indigo-600/20 blur-[130px]" />

          <div className="relative mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start lg:gap-16 lg:px-8">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 font-ui text-[12px] font-bold uppercase tracking-[0.05em] text-green-400 lg:text-[13px]">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Free Preview · No Signup Required
              </p>
              <h1 className="mt-6 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] lg:text-[56px] lg:leading-[1.05]">
                Free AI B-Roll Generator
              </h1>
              <p className="mt-6 max-w-xl text-[16px] leading-[1.6] text-zinc-300 lg:text-[17px]">
                Paste your script, or upload footage you've already shot.
                SpyReels matches every beat to real footage automatically and
                turns it into a fully B-rolled video. Fine-tune any clip you
                don't like, and more, in the best free AI B-roll generator
                online.
              </p>
              <div className="mt-8 flex flex-col items-start gap-4">
                <a
                  href="#demo"
                  className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-7 py-3.5 font-ui text-[15px] font-bold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
                >
                  Generate My B-Roll Preview
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 8h11M9 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="#sample-output"
                  className="font-ui text-[15px] font-medium text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
                >
                  See a sample output first →
                </a>
                <p className="font-ui text-[13px] font-medium text-zinc-500">
                  No credit card. No login. Preview in under 30 seconds.
                </p>
              </div>
              <p className="mt-6 text-[13px] text-zinc-500">
                By Noah Perry · Updated Aug 5, 2026 · 4 min read
              </p>
            </div>

            <DemoWidget
              remaining={remaining}
              watermarked={watermarked}
              canDownload={canDownload}
              isAuthenticated={isAuthenticated}
              onQuotaChange={setRemaining}
              onSignUp={openSignup}
              onDownloadLocked={handleDownloadLocked}
              onDownloadUnlocked={(m) => {
                void handleDownloadUnlocked(m);
              }}
            />
          </div>
        </section>

        <SocialProof />
        <HowItWorks />
        <InputModes />
        <WhyBroll />
        <SampleGallery />
        <UseCaseGrid />
        <ComparisonTable />
        <Faq />
        <FinalCta />

        <section className="bg-white py-10">
          <div className="mx-auto max-w-3xl px-6 text-sm text-zinc-500 lg:px-8">
            <h2 className="font-display text-lg font-semibold text-zinc-900">
              Related tools
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>
                <Link
                  href="/free-tools/viral-hooks"
                  className="text-violet-700 hover:underline"
                >
                  Free Instagram viral hook generator
                </Link>
              </li>
              <li>
                <Link
                  href="/features/viral-reel-finder"
                  className="text-violet-700 hover:underline"
                >
                  Viral Reel Finder
                </Link>
              </li>
              <li>
                <Link
                  href="/features/ai-personal-brand-coach"
                  className="text-violet-700 hover:underline"
                >
                  AI Personal Brand Coach
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <PricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        onSeePlans={() => void handleSeePlans()}
        busy={checkoutMutation.isPending}
      />

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode="signup"
        headline={authHeadline || undefined}
        returnTo={BROLL_PATH}
      />

      <PublicFooter />
    </div>
  );
}
