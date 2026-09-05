import type { Metadata } from "next";
import ViralFinderExperience from "./ViralFinderExperience";
import styles from "./page.module.css";

const SITE_URL = "https://spyreels.ai";
const CANONICAL = `${SITE_URL}/features/viral-reel-finder`;
const TITLE = "Instagram Reel Spy Tool - Find Any Account's Viral Reels Free";
const DESCRIPTION =
  "Search any Instagram creator's Reels, sort by views and engagement rate, then turn the strongest patterns into your own content direction with SpyReels.";

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
    q: "What is the viral finder on Instagram?",
    a: "Instagram has no built-in viral finder. A viral finder brings public Reels from an account into one research view and ranks them by performance signals such as views, engagement and outlier score instead of leaving them in date order.",
  },
  {
    q: "Which reel is viral on Instagram?",
    a: "Viral is relative, not absolute. A useful signal is how far a Reel beats that account's normal performance. That is why SpyReels shows outlier score alongside raw views.",
  },
  {
    q: "Is there a free reel spy tool?",
    a: "Yes. SpyReels has a free tier and does not ask for a credit card to start. The public preview on this page also lets you explore real curated example data before creating an account.",
  },
  {
    q: "Is there a way to find a specific reel on Instagram?",
    a: "SpyReels is designed for competitive research across an account's catalogue rather than locating one particular video you half-remember. For a specific Reel, Instagram's own search or saved collections may be faster.",
  },
  {
    q: "What is the best Instagram reel spy tool?",
    a: "The best tool depends on the workflow you need. SpyReels is designed to connect research with the next step: choosing a strong pattern and moving it into your own script and production workflow.",
  },
  {
    q: "How do I find viral Reels for free?",
    a: "Start with a public handle, compare the strongest posts against that account's normal performance, and look for repeated hooks, formats and topics across several outliers instead of copying one video in isolation.",
  },
] as const;

const HOW_IT_WORKS = [
  ["01", "Find the winners", "Paste a public handle and surface the Reels that actually broke away from the account's normal baseline."],
  ["02", "Understand the pattern", "Compare views, engagement, outlier score and opening hooks without jumping between tabs."],
  ["03", "Turn research into your version", "Carry the useful structure into a new script and production direction instead of starting from a blank page."],
] as const;

const OUTPUTS = [
  ["Ranked Reels", "See strongest posts first instead of a chronological profile feed."],
  ["Outlier score", "Understand what overperformed for that creator, not just what has a big raw view count."],
  ["Opening hook", "Read the first idea or line in context across several winners."],
  ["Creation path", "Move from research into your own script and production workflow."],
] as const;

const RELATED_LINKS = [
  ["How to find viral Reels in your niche", `${SITE_URL}/blog/guide-find-viral-reels-your-niche`],
  ["How to reverse engineer viral Reels", `${SITE_URL}/blog/guide-reverse-engineer-viral-reels`],
  ["Free viral hook generator", `${SITE_URL}/free-tools/viral-hooks`],
  ["Free AI script generator", `${SITE_URL}/free-tools/ai-script-generator`],
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

      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <a className={styles.brand} href={SITE_URL}>SpyReels</a>
          <nav className={styles.nav} aria-label="Viral Reel Finder page navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#what-you-get">What you get</a>
            <a href="#faq">FAQ</a>
            <a href={`${SITE_URL}/pricing`}>Pricing</a>
          </nav>
          <a className={styles.headerCta} href="#try-finder">Try live demo</a>
        </div>
      </header>

      <section className={`${styles.shell} ${styles.hero}`}>
        <div className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden />
          Free Instagram Reel Finder
        </div>
        <h1>
          Find the Reels that are <span className={styles.accent}>actually winning.</span>
        </h1>
        <p className={styles.heroLead}>
          Paste an Instagram handle. SpyReels ranks the account by views, engagement and outlier score,
          then shows you how the strongest ideas can continue into your own content workflow.
        </p>
        <ViralFinderExperience />
      </section>

      <main className={`${styles.shell} ${styles.content}`}>
        <section className={styles.section}>
          <div className={styles.sectionSplit}>
            <div>
              <span className={styles.sectionKicker}>Why creators use it</span>
              <h2>What is an Instagram reel spy tool?</h2>
            </div>
            <div className={styles.sectionCopy}>
              <p>
                It is a faster way to answer one question: <strong>which Reels from this creator are worth studying?</strong>
                Instead of scrolling a profile in date order, SpyReels puts performance and the opening idea together in one view.
              </p>
              <div className={styles.inlineProof}>
                <span>Ranked by performance</span>
                <span>Relative outlier score</span>
                <span>Research → creation</span>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className={styles.section}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionKicker}>Three steps</span>
            <h2>How the Instagram reel finder works</h2>
            <p>No long setup. The page itself shows the product before asking you to create an account.</p>
          </div>
          <div className={styles.stepsGrid}>
            {HOW_IT_WORKS.map(([num, title, body]) => (
              <article className={styles.stepCard} key={num}>
                <small>{num}</small>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="what-you-get" className={styles.section}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionKicker}>Product output</span>
            <h2>What you get back from every search</h2>
          </div>
          <div className={styles.outputsGrid}>
            {OUTPUTS.map(([title, body], index) => (
              <article className={styles.outputCard} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionKicker}>Questions</span>
            <h2>Reel finder and reel spy tool questions people actually ask</h2>
          </div>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details className={styles.faqItem} key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.learningStrip}>
          <div>
            <span className={styles.sectionKicker}>Keep learning</span>
            <h2>Go deeper on Reel research</h2>
          </div>
          <nav className={styles.relatedLinks} aria-label="Related SpyReels resources">
            {RELATED_LINKS.map(([label, href]) => <a href={href} key={href}>{label} →</a>)}
          </nav>
        </section>
      </main>

      <section className={`${styles.shell} ${styles.finalCta}`}>
        <span className={styles.sectionKicker}>Try the product first</span>
        <h2>Start with one creator you already follow.</h2>
        <p>See their strongest Reels, click into the remake flow, then decide if SpyReels is useful for your workflow.</p>
        <a className={styles.headerCta} href="#try-finder">Try the live demo</a>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerInner}`}>
          <span>© SpyReels</span>
          <span>
            <a href={`${SITE_URL}/pricing`}>Pricing</a> · <a href={`${SITE_URL}/blog`}>Blog</a> ·{" "}
            <a href={`${SITE_URL}/privacy`}>Privacy</a> · <a href={`${SITE_URL}/terms`}>Terms</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
