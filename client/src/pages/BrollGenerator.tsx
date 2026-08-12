import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { trpc } from "@/lib/trpc";
import { authHeadlineBrollGenerate } from "@/lib/authHeadlines";
import type { BrollLandingMatch } from "@shared/brollLanding";
import {
  clearBrollPendingPreview,
  peekBrollPendingPreview,
  stashBrollPreviewBeforeCheckout,
  type BrollPendingPreview,
  type BrollPreviewSnapshot,
} from "@/lib/brollPendingPreview";
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
  Faq,
  FinalCta,
  HowItWorks,
  InputModes,
  MoreFeatures,
  SampleGallery,
  SocialProof,
  UseCaseGrid,
  WhenToUseBroll,
} from "@/components/brollLanding/StaticSections";
import { RelatedToolsGrid } from "@/components/RelatedToolsGrid";
import {
  RELATED_TOOL_THUMB_AI_COACH,
  RELATED_TOOL_THUMB_TIKTOK_FINDER,
  RELATED_TOOL_THUMB_VIRAL_FINDER,
  RELATED_TOOL_THUMB_YOUTUBE_FINDER,
} from "@/components/relatedToolThumbs";
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
  const [restorePending, setRestorePending] =
    useState<BrollPendingPreview | null>(null);
  const snapshotRef = useRef<BrollPreviewSnapshot | null>(null);
  const quotaQuery = trpc.brollLanding.quota.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const checkoutMutation = trpc.billing.checkout.useMutation();
  const downloadMutation = trpc.brollLanding.downloadClips.useMutation();

  useEffect(() => {
    setRestorePending(peekBrollPendingPreview());
  }, []);

  const handleSnapshotChange = useCallback((snapshot: BrollPreviewSnapshot) => {
    snapshotRef.current = snapshot;
  }, []);

  const handleRestoreConsumed = useCallback(() => {
    clearBrollPendingPreview();
    setRestorePending(null);
  }, []);

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

  function stashPreviewIfPresent(): void {
    const snapshot = snapshotRef.current;
    if (snapshot?.phase === "results") {
      stashBrollPreviewBeforeCheckout(snapshot);
    }
  }

  function openSignup() {
    stashPreviewIfPresent();
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
    if (snapshotRef.current) {
      stashBrollPreviewBeforeCheckout(snapshotRef.current);
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
    <div className="broll-landing min-h-screen bg-background text-foreground">
      <PublicHeader
        onBeforeAuthOpen={stashPreviewIfPresent}
        authReturnTo={BROLL_PATH}
      />

      {/* Light chrome scoped to main content only so PublicHeader keeps theme tokens. */}
      <main className="bg-white text-zinc-900">
        <section className="relative overflow-hidden bg-[#0a0a0f] pb-20 pt-16 text-white lg:pb-28 lg:pt-24">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/25 blur-[140px]" />
          <div className="pointer-events-none absolute -bottom-56 right-[-120px] h-[420px] w-[620px] rounded-full bg-indigo-600/20 blur-[130px]" />

          <div className="relative mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start lg:gap-16 lg:px-8">
            <div className="max-w-2xl">
              <Breadcrumb>
                <BreadcrumbList className="text-zinc-400">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/">Home</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/free-tools/viral-hooks">Free Tools</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-zinc-200">
                      B-Roll Generator
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
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
              restorePending={restorePending}
              onRestoreConsumed={handleRestoreConsumed}
              onSnapshotChange={handleSnapshotChange}
            />
          </div>
        </section>

        <SocialProof />
        <HowItWorks />
        <InputModes />
        <WhenToUseBroll />
        <SampleGallery />
        <UseCaseGrid />
        <MoreFeatures />
        <Faq />
        <FinalCta />

        <RelatedToolsGrid
          subtitle="Cross-platform research and the tools that turn winners into videos."
          tools={[
            {
              title: "Instagram Viral Reel Finder",
              href: "/features/viral-reel-finder",
              imageUrl: RELATED_TOOL_THUMB_VIRAL_FINDER,
            },
            {
              title: "TikTok Viral Video Finder",
              href: "/free-tools/tiktok-viral-video-finder",
              imageUrl: RELATED_TOOL_THUMB_TIKTOK_FINDER,
            },
            {
              title: "YouTube Shorts Viral Finder",
              href: "/free-tools/youtube-shorts-viral-finder",
              imageUrl: RELATED_TOOL_THUMB_YOUTUBE_FINDER,
            },
            {
              title: "AI Script Generator",
              href: "/features/ai-personal-brand-coach",
              imageUrl: RELATED_TOOL_THUMB_AI_COACH,
            },
          ]}
        />
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
