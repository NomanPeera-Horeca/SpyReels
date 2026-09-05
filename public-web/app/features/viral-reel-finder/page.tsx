import type { Metadata } from "next";
import FinderHandoffForm from "./FinderHandoffForm";
import styles from "./page.module.css";

const SITE_URL = "https://spyreels.ai";
const CANONICAL = `${SITE_URL}/features/viral-reel-finder`;
const TITLE = "Instagram Reel Spy Tool - Find Any Account's Viral Reels Free";
const DESCRIPTION =
  "Search any Instagram creator's Reels, sort by views and engagement rate, then remake the best ones in your own voice in seconds and go viral.";

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
    a: "Instagram has no built-in viral finder. A viral finder is third-party software that pulls the public Reels from an account and ranks them by performance signals such as views, engagement rate and outlier score, so the top performers separate from the rest instead of appearing in date order.",
  },
  {
    q: "Which reel is viral on Instagram?",
    a: "Viral is relative, not absolute. A Reel is an outlier when it beats that account's own median view count by a wide multiple. A 40,000-view Reel on a 2,000-follower account is a far stronger signal than a 400,000-view Reel from an account that averages 380,000.",
  },
  {
    q: "Is there a free reel spy tool?",
    a: "Yes. SpyReels has a free tier and does not ask for a credit card. You can run searches, see an account's Reels ranked by performance and read hook transcripts before paying anything.",
  },
  {
    q: "Is there a way to find a specific reel on Instagram?",
    a: "SpyReels is built for competitive research across an account's whole catalogue, not for locating one particular video you half-remember. To find a specific Reel, use Instagram's own search, or check your saved and liked collections.",
  },
  {
    q: "What is the best Instagram reel spy tool?",
    a: "It depends what you need. SpyReels is built to continue past research: a Reel it surfaces can be transcribed and then used as the starting point for a new script and production plan in your own voice.",
  },
  {
    q: "How do I find viral Reels for free?",
    a: "Paste a public handle into a free reel spy tool and sort by outlier score rather than raw views. Read the first three seconds of the top five Reels and note what they have in common. That repeated pattern is the useful research signal.",
  },
] as const;

const HOW_IT_WORKS = [
  [
    "01",
    "Paste a public handle.",
    "Start with any public creator or competitor account. The live product can research the handle and bring its public Reel catalogue into one place.",
  ],
  [
    "02",
    "Read the outliers.",
    "Sort by outlier score to see which Reels beat that account's own baseline instead of judging performance by raw views alone.",
  ],
  [
    "03",
    "Turn research into your own version.",
    "Study the winning hook and structure, then continue into SpyReels to create a new script and production plan in your own voice.",
  ],
] as const;

const OUTPUTS = [
  [
    "01",
    "Ranked Reels, not a chronological feed",
    "A profile feed shows recent work first. A reel finder is useful because it reorders the catalogue around performance signals so the strongest posts are easier to study.",
  ],
  [
    "02",
    "An outlier score against the account's own baseline",
    "The same number of views can mean very different things for different accounts. Relative performance helps smaller but unusually strong posts stand out.",
  ],
  [
    "03",
    "The hook in text",
    "Reading the opening lines across several winners makes it faster to compare the first three seconds without repeatedly scrubbing through every video.",
  ],
  [
    "04",
    "A path from research into creation",
    "The useful next step is not copying another creator word for word. It is carrying the winning structure into your own angle, language and production plan.",
  ],
] as const;

const AUDIENCES = [
  ["Growing creators", "Research accounts one step ahead of you and learn from their strongest outliers instead of guessing what to post."],
  ["Local businesses", "Compare what is working for restaurants, gyms, salons and other businesses in the same category across different markets."],
  ["Agencies", "Review a client's competitor set quickly and turn the findings into practical content directions instead of a spreadsheet of links."],
  ["Faceless pages", "Spot formats and opening patterns that repeat across a niche before you choose what to adapt for your own audience."],
] as const;

const COMPARISON_ROWS = [
  ["Free tier without a credit card", "Yes", "Card required for trial", "Not stated on site"],
  ["Ranks an account's Reels by performance", "Yes", "Yes", "Yes"],
  ["Outlier score vs the account's own baseline", "Yes", "Partial", "No"],
  ["Hook transcript in text", "Yes", "Partial", "No"],
  ["Continues from research into a new script", "Yes", "No", "No"],
  ["TikTok and YouTube Shorts research too", "Yes", "Partial", "Instagram only"],
] as const;

const RELATED_LINKS = [
  ["How to find viral Reels in your niche", "/blog/guide-find-viral-reels-your-niche"],
  ["How to reverse engineer viral Reels", "/blog/guide-reverse-engineer-viral-reels"],
  ["Instagram Reels hook patterns study", "/blog/guide-instagram-reels-hook-patterns-data"],
  ["Instagram Reels content analysis", "/blog/guide-instagram-reels-content-analysis-2026"],
  ["Free viral hook generator", "/free-tools/viral-hooks"],
  ["Free AI script generator", "/free-tools/ai-script-generator"],
  ["All free creator tools", "/free-tools"],
  ["SpyReels pricing", "/pricing"],
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

export default function ViralReelFinderPilotPage() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <a className={styles.brand} href="/">
            SpyReels
          </a>
          <nav className={styles.nav} aria-label="Viral Reel Finder page navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#what-you-get">What you get</a>
            <a href="#compare">Compare</a>
            <a href="#faq">FAQ</a>
            <a href="/pricing">Pricing</a>
          </nav>
          <a className={styles.headerCta} href="/research">
            Start free
          </a>
        </div>
      </header>

      <section className={`${styles.shell} ${styles.hero}`}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span aria-hidden>/</span>
          <a href="/free-tools">Free Tools</a>
          <span aria-hidden>/</span>
          <span>Viral Reel Finder</span>
        </nav>
        <div className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden />
          Free reel finder and reel spy tool
        </div>
        <h1>
          Any Instagram account&apos;s viral Reels, <span className={styles.accent}>remade in your voice.</span>
        </h1>
        <p className={styles.heroLead}>
          Paste a public handle. A free reel finder that sorts by views, engagement and outlier score
          so you can study the strongest posts before creating your own version.
        </p>
        <FinderHandoffForm />
      </section>

      <section className={`${styles.shell} ${styles.preview}`} aria-label="Example Reel Finder results">
        <div className={styles.previewHeader}>
          <span>Results preview</span>
          <span className={styles.statsNote}>Server-rendered example · live research opens in SpyReels</span>
        </div>
        <div className={styles.previewGrid}>
          {[
            ["8.6x median", "A hook that breaks the account's normal baseline"],
            ["5.1x median", "A repeatable format with unusually strong distribution"],
            ["3.7x median", "A simple opening pattern worth comparing with other winners"],
            ["2.9x median", "A strong Reel whose structure can become a new creative direction"],
          ].map(([score, hook]) => (
            <article className={styles.previewCard} key={score}>
              <div className={styles.previewArt}>
                <strong>{score}</strong>
              </div>
              <div className={styles.previewBody}>
                <p>{hook}</p>
              </div>
            </article>
          ))}
        </div>
        <div className={styles.previewFooter}>
          <span>The live product ranks public Reels and lets you continue from research into creation.</span>
          <a className={styles.secondaryButton} href="/research">
            Open research
          </a>
        </div>
      </section>

      <main className={`${styles.shell} ${styles.content}`}>
        <section className={styles.section}>
          <h2>What is an Instagram reel spy tool?</h2>
          <p className={styles.sectionLead}>
            An Instagram reel spy tool — also called a reel finder, reels finder or viral reel finder —
            brings the public Reels from an account into one research view and ranks them by performance
            instead of leaving them in date order. SpyReels focuses on views, engagement and relative
            performance so the unusual winners are easier to identify and study.
          </p>
          <ul className={styles.bullets}>
            <li>
              <strong>Ranked, not chronological.</strong> Research should surface an account&apos;s strongest
              work, not merely its most recent uploads.
            </li>
            <li>
              <strong>Relative performance, not raw views alone.</strong> An unusually strong Reel on a
              smaller account can be a more useful research signal than an ordinary Reel on a huge one.
            </li>
          </ul>
        </section>

        <section id="how-it-works" className={styles.section}>
          <h2>How the Instagram reel finder works</h2>
          <p className={styles.sectionLead}>
            The research workflow is intentionally simple: choose the account, identify the outliers,
            then decide which underlying idea or structure is worth adapting.
          </p>
          <div className={styles.cards3}>
            {HOW_IT_WORKS.map(([num, title, body]) => (
              <article className={styles.infoCard} key={num}>
                <small>{num}</small>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="what-you-get" className={styles.section}>
          <h2>What you get back from every search</h2>
          <p className={styles.sectionLead}>
            A useful reel finder should do more than display thumbnails. It should help you understand
            which posts matter, why they matter and what to do with the research next.
          </p>
          <div className={styles.cards2}>
            {OUTPUTS.map(([num, title, body]) => (
              <article className={styles.infoCard} key={num}>
                <small>{num}</small>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="compare" className={styles.section}>
          <h2>SpyReels vs Meedro vs ViralFindr</h2>
          <p className={styles.sectionLead}>
            All three products are used for Reel research. The main SpyReels distinction is the path
            from finding a strong post into developing a new script and production direction.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className={styles.tableHighlight}>SpyReels</th>
                  <th>Meedro</th>
                  <th>ViralFindr</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(([feature, spy, meedro, viralfindr]) => (
                  <tr key={feature}>
                    <td>{feature}</td>
                    <td className={styles.tableHighlight}>{spy}</td>
                    <td>{meedro}</td>
                    <td>{viralfindr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.statsNote}>
            Comparison copy is carried forward from the existing SpyReels landing page and should be
            re-verified against each competitor before this pilot is promoted to production ownership.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Who uses this free Instagram reel finder</h2>
          <div className={styles.cards4}>
            {AUDIENCES.map(([title, body]) => (
              <article className={styles.infoCard} key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <h2>Reel finder and reel spy tool questions people actually ask</h2>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <article className={styles.faqItem} key={item.q}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Continue your Reel research</h2>
          <p className={styles.sectionLead}>
            These related pages connect the Viral Reel Finder to the broader SpyReels research and
            creation cluster. They are ordinary HTML links in the first response, not JavaScript-only
            navigation.
          </p>
          <nav className={styles.relatedLinks} aria-label="Related SpyReels resources">
            {RELATED_LINKS.map(([label, href]) => (
              <a href={href} key={href}>
                {label}
              </a>
            ))}
          </nav>
        </section>
      </main>

      <section className={`${styles.shell} ${styles.finalCta}`}>
        <h2>Try it on one account</h2>
        <p>
          Start with a public Instagram account, find the posts that broke away from its normal
          baseline, and use those findings as better input for your next piece of content.
        </p>
        <a className={styles.headerCta} href="/research">
          Start free
        </a>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerInner}`}>
          <span>© SpyReels</span>
          <span>
            <a href="/pricing">Pricing</a> · <a href="/blog">Blog</a> · <a href="/privacy">Privacy</a> ·{" "}
            <a href="/terms">Terms</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
