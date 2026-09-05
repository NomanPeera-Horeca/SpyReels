import type { Metadata } from "next";
import { PublicSiteFooter } from "../../../components/PublicSiteFooter";
import { PublicSiteHeader } from "../../../components/PublicSiteHeader";
import { RelatedTools } from "./RelatedTools";
import ViralFinderExperience from "./ViralFinderExperience";
import styles from "./page.module.css";

const SITE_URL = "https://spyreels.ai";
const CANONICAL = `${SITE_URL}/features/viral-reel-finder`;
const TITLE = "Instagram Reel Spy Tool - Find Any Account's Viral Reels Free";
const DESCRIPTION =
  "Search any Instagram creator's Reels, compare the strongest posts by views and engagement, then carry the useful ideas into your own script workflow.";

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
    a: "The page can identify public Instagram profiles before you continue. The live preview uses a small set of accounts already available in SpyReels; researching another account continues inside the SpyReels app.",
  },
  {
    q: "What does SpyReels do after I find a strong Reel?",
    a: "You can study the opening hook, transcribe the Reel, keep it as research context, and move the useful idea into your own script and production workflow instead of simply copying the original post.",
  },
  {
    q: "Is there a free version?",
    a: "Yes. SpyReels has a free tier so you can try the research workflow before deciding whether you need a paid plan.",
  },
] as const;

const RELATED_LINKS = [
  ["How to find viral Reels in your niche", "/blog/guide-find-viral-reels-your-niche"],
  ["How to reverse engineer viral Reels", "/blog/guide-reverse-engineer-viral-reels"],
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
  name: "SpyReels Instagram Reel Spy Tool",
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

      <PublicSiteHeader />

      <main>
        <section className={`${styles.shell} ${styles.hero}`}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden />
            Free Instagram Reel Finder
          </div>
          <h1>
            Any Instagram account&apos;s viral Reels, <span className={styles.accent}>remade in your voice.</span>
          </h1>
          <p className={styles.heroLead}>
            Paste a public Instagram handle. SpyReels identifies the account, shows the strongest Reels you can study, and connects the research to your own content workflow.
          </p>
          <ViralFinderExperience />
        </section>

        <section className={`${styles.shell} ${styles.simpleSteps}`} id="how-it-works">
          <div className={styles.sectionCopy}>
            <span className={styles.sectionEyebrow}>How it works</span>
            <h2>Three steps from competitor account to a useful content direction.</h2>
          </div>
          <div className={styles.stepRow}>
            <article><small>01</small><h3>Paste a public handle</h3><p>Confirm the actual Instagram profile before starting research.</p></article>
            <article><small>02</small><h3>Study the strongest Reels</h3><p>Compare the posts by real view and engagement data instead of scrolling blindly.</p></article>
            <article><small>03</small><h3>Continue into creation</h3><p>Transcribe the Reel and move the useful pattern into your own script workflow.</p></article>
          </div>
        </section>

        <section className={`${styles.shell} ${styles.faqSection}`} id="faq">
          <div className={styles.sectionCopy}>
            <span className={styles.sectionEyebrow}>FAQ</span>
            <h2>Questions about the Instagram Reel Finder</h2>
          </div>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <RelatedTools />

        <section className={`${styles.shell} ${styles.relatedStrip}`}>
          <div>
            <span className={styles.sectionEyebrow}>Keep learning</span>
            <h2>Go deeper on Reel research</h2>
          </div>
          <nav aria-label="Related Reel research resources">
            {RELATED_LINKS.map(([label, path]) => (
              <a href={`${SITE_URL}${path}`} key={path}>{label} →</a>
            ))}
          </nav>
        </section>

        <section className={`${styles.shell} ${styles.finalCta}`}>
          <span className={styles.sectionEyebrow}>Try the product first</span>
          <h2>Start with one creator you already follow.</h2>
          <p>Find the account above, explore the interaction, and see exactly what happens before you decide to continue.</p>
          <a className={styles.primaryLink} href="#live-demo">Try the interactive demo</a>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
