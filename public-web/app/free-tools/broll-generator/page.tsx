import {
  MarketingFooter,
  MarketingHeader,
} from "../../../components/MarketingChrome";
import { HomepageAuthGate } from "../../../components/HomepageAuthGate";
import {
  MarketingFaq,
  MarketingFinalCta,
} from "../../../components/MarketingPageSections";
import { MarketingProcessSteps } from "../../../components/MarketingProcessSteps";
import { buildFaqPageJsonLd, jsonLdScript } from "../../../components/marketingFaqJsonLd";
import { SPYREELS_SITE_URL } from "../../../../shared/publicPageMeta";
import {
  BROLL_HOW_IT_WORKS_STEPS,
  BROLL_LANDING_FAQ,
} from "../../../lib/brollLandingCopy";
import { BROLL_CANONICAL, brollMetadata } from "../../../lib/brollPageSeo";
import { BrollGeneratorClient } from "./BrollGeneratorClient";
import {
  BrollInputModes,
  BrollMoreFeatures,
  BrollRelatedTools,
  BrollSampleGallery,
  BrollSocialProof,
  BrollUseCaseGrid,
  BrollWhenToUse,
} from "./BrollStaticSections";
import styles from "./BrollGenerator.module.css";
import "../../homepage.css";

export const metadata = brollMetadata;

const breadcrumbJsonLd = {
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
};

const softwareJsonLd = {
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
};

const howToJsonLd = {
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
};

const faqJsonLd = buildFaqPageJsonLd(BROLL_LANDING_FAQ);

export default function BrollGeneratorPage() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd) }}
      />

      <MarketingHeader />

      <main>
        <BrollGeneratorClient />

        <BrollSocialProof />

        <MarketingProcessSteps
          presentation="numbered"
          pair="start"
          title="How the B-Roll Generator Works"
          steps={BROLL_HOW_IT_WORKS_STEPS.map((step, index) => ({
            number: String(index + 1),
            title: step.title,
            body: step.body,
          }))}
        />

        <BrollInputModes />
        <BrollWhenToUse />
        <BrollSampleGallery />
        <BrollUseCaseGrid />
        <BrollMoreFeatures />

        <BrollRelatedTools />

        <MarketingFaq
          title="Frequently Asked Questions"
          description=""
          items={BROLL_LANDING_FAQ}
        />

        <MarketingFinalCta
          title="Your Next Video Doesn't Need More Footage. It Needs the Right Footage."
          body="No credit card. No login. Preview in under 30 seconds."
          buttonLabel="Try the Free B-Roll Generator"
          href="#demo"
        />
      </main>

      <MarketingFooter />
      <HomepageAuthGate />
    </div>
  );
}
