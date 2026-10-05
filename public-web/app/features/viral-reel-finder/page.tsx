import type { Metadata } from "next";
import Script from "next/script";
import { MarketingFinderMotion, MarketingFooter, MarketingHeader } from "../../../components/MarketingChrome";
import { finderNextTools, MarketingFaq, MarketingFinalCta, MarketingPlatformStrip, MarketingWorkspace } from "../../../components/MarketingPageSections";
import ViralFinderExperience from "./ViralFinderExperience";
import { HomepageAuthGate } from "../../../components/HomepageAuthGate";
import { MarketingHeroEyebrow } from "../../../components/MarketingHeroEyebrow";
import "../../homepage.css";
import styles from "./page.module.css";

const SITE_URL = "https://spyreels.ai";
const CANONICAL = `${SITE_URL}/features/viral-reel-finder`;
/** Primary: viral reel finder / viral finder (DataForSEO). Locked for GSC stability. */
const TITLE = "Viral Reel Finder for Instagram | SpyReels";
const DESCRIPTION =
  "Free viral Reel finder for Instagram. Paste a public creator handle, rank Reels by views and engagement, then remake what worked in your own voice.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    siteName: "SpyReels",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const FAQ_ITEMS = [
  {
    q: "What is an Instagram Reel finder?",
    a: "An Instagram Reel finder (also called a viral Reel finder or Reels finder) pulls a public creator's Reels into one research view so you can compare posts by views and engagement instead of scrolling the profile manually.",
  },
  {
    q: "Is SpyReels a free viral finder?",
    a: "Yes. SpyReels includes a free viral finder tier so you can paste a public Instagram handle, preview ranked Reels, and try the research workflow before upgrading.",
  },
  {
    q: "Reel finder vs Instagram Search: which should I use?",
    a: "Use Instagram Search when you need native discovery by keyword, audio, or hashtag. Use a Reel finder when you already know the creator and want their Reels ranked by performance.",
    afterLink: {
      href: `${SITE_URL}/blog/guide-how-to-search-reels-on-instagram`,
      label: "How to search Reels on Instagram",
    },
  },
  {
    q: "Can I find viral Instagram posts, not only Reels?",
    a: "This viral Reel finder focuses on Reels performance for a public account. Viral posts and feed carousels are a different format; start with Reels here, then use SpyReels research tools when you want to turn a winning idea into a script.",
  },
  {
    q: "Can I search any public Instagram account?",
    a: "Yes. Enter a public Instagram handle to confirm the profile. Select it to sign in and open Creator Radar with that creator ready for Reel research.",
  },
  {
    q: "What does SpyReels do after I find a strong Reel?",
    a: "This page shows the hook and performance numbers. In SpyReels you can transcribe the Reel and use that research as context for an original script in your voice.",
  },
] as const;

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Viral Reel Finder", item: CANONICAL },
  ],
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SpyReels Viral Reel Finder",
  alternateName: [
    "Viral Reel Finder",
    "Instagram Reel Finder",
    "Reel Finder",
    "Reels Finder",
    "Instagram Reel Spy Tool",
  ],
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web Browser",
  url: CANONICAL,
  description: DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free tier available",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text:
        "afterLink" in item && item.afterLink
          ? `${item.a} ${item.afterLink.label}: ${item.afterLink.href}`
          : item.a,
    },
  })),
};

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function ViralReelFinderPilotPage() {
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd) }} />

      <MarketingHeader />

      <main>
        <section className={`${styles.shell} ${styles.hero}`}>
          <MarketingHeroEyebrow>Free Instagram Reel Finder</MarketingHeroEyebrow>
          <h1>
            Find <span className={styles.accent}>viral</span> Instagram Reels in your niche
          </h1>
          <p className={styles.heroLead}>
            Find top-performing Reels from any public Instagram creator, then remake
            the winning format in your own voice in under 3 minutes.
          </p>
          <ViralFinderExperience />
        </section>

        <section className={styles.motionStage} aria-label="See the SpyReels workflow">
          <div className={styles.motionFrame}>
            <MarketingFinderMotion />
          </div>
        </section>

        <MarketingPlatformStrip />

        <section className={`${styles.shell} ${styles.simpleSteps}`} id="how-it-works">
          <div className={styles.sectionCopy}>
            <span className={styles.sectionEyebrow}>How it works</span>
            <h2>Research to ready-to-film in 3 minutes</h2>
          </div>
          <div className={styles.stepRow}>
            <article><small>01</small><h3>Paste a public handle</h3><p>Go straight to the creator whose Reels you want to study.</p></article>
            <article><small>02</small><h3>Study the strongest Reels</h3><p>Open that creator in SpyReels to compare the posts that performed best.</p></article>
            <article><small>03</small><h3>Continue into creation</h3><p>Transcribe the Reel and move the useful pattern into your own script workflow.</p></article>
          </div>
        </section>

        <MarketingWorkspace title="Find a Reel. Make the next one yours." tools={finderNextTools} />

        <MarketingFaq
          title="Questions about finding viral Reels."
          description="Search a public creator, study standout Reel examples, and bring a promising idea into your own script workflow."
          items={FAQ_ITEMS}
        />

        <MarketingFinalCta
          title="Your next idea starts with a Reel worth studying."
          description="Search a creator. Find a strong idea. Turn it into a script in your voice."
          label="Find viral Reels"
          href="#live-demo"
        />
      </main>

      <MarketingFooter />
      <HomepageAuthGate />
      <Script src="/marketing/chrome.js" strategy="afterInteractive" />
    </div>
  );
}
