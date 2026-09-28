import type { Metadata } from "next";
import Script from "next/script";
import { MarketingFinderMotion, MarketingFooter, MarketingHeader } from "../../../components/MarketingChrome";
import { finderNextTools, MarketingFaq, MarketingFinalCta, MarketingPlatformStrip, MarketingWorkspace } from "../../../components/MarketingPageSections";
import ViralFinderExperience from "./ViralFinderExperience";
import "../../homepage.css";
import styles from "./page.module.css";

const SITE_URL = "https://spyreels.ai";
const CANONICAL = `${SITE_URL}/features/viral-reel-finder`;
const TITLE = "Viral Reel Finder for Instagram | SpyReels";
const DESCRIPTION =
  "Find viral Instagram Reels in your niche. Search a public creator, explore standout Reel examples, and turn what works into original scripts in your voice with SpyReels.";

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
    a: "An Instagram Reel finder brings the public Reels from a creator account into one research view so you can compare the posts that performed best instead of scrolling the profile manually.",
  },
  {
    q: "Can I search any public Instagram account?",
    a: "Yes. Enter a public Instagram handle to see a sample of its recent Reels ranked by views. Continue in your SpyReels workspace for deeper research.",
  },
  {
    q: "What does SpyReels do after I find a strong Reel?",
    a: "This page shows the opening and the performance numbers. If you continue in SpyReels, you can transcribe the Reel and use that research as context for an original script.",
  },
  {
    q: "Is there a free version?",
    a: "Yes. SpyReels has a free tier so you can try the research workflow before deciding whether you need a paid plan.",
  },
] as const;

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Free Tools", item: `${SITE_URL}/free-tools` },
    { "@type": "ListItem", position: 3, name: "Viral Reel Finder", item: CANONICAL },
  ],
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SpyReels Viral Reel Finder for Instagram",
  alternateName: ["Instagram Reel Finder", "Viral Reel Finder", "Reel Spy Tool", "Reels Finder"],
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
    acceptedAnswer: { "@type": "Answer", text: item.a },
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
          <div className={styles.eyebrow}>Viral Reel Finder</div>
          <h1>
            Find viral Instagram Reels in your niche
          </h1>
          <p className={styles.heroLead}>
            Search a public creator. Find the posts worth studying. Turn what works into a script in your voice.
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
            <article><small>02</small><h3>Study the strongest Reels</h3><p>Compare a creator's recent Reels by views or engagement, then pick an idea worth studying.</p></article>
            <article><small>03</small><h3>Continue into creation</h3><p>Transcribe the Reel and move the useful pattern into your own script workflow.</p></article>
          </div>
        </section>

        <MarketingWorkspace title="Find a Reel. Make the next one yours." tools={finderNextTools} />

        <MarketingFaq title="Questions about finding viral Reels." description="Search a public creator, study standout Reel examples, and bring a promising idea into your own script workflow." items={FAQ_ITEMS} />

        <MarketingFinalCta title="Your next idea starts with a Reel worth studying." description="Search a creator. Find a strong idea. Turn it into a script in your voice." label="Find viral Reels" href="#live-demo" />
      </main>

      <MarketingFooter />
      <Script src="/marketing/chrome.js" strategy="afterInteractive" />
    </div>
  );
}
