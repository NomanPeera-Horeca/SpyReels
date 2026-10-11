import {
  MarketingFooter,
  MarketingHeader,
} from "../../components/MarketingChrome";
import { HomepageAuthGate } from "../../components/HomepageAuthGate";
import { MarketingHeroEyebrow } from "../../components/MarketingHeroEyebrow";
import { MarketingIconStar } from "../../components/MarketingIcons";
import { MarketingFaq } from "../../components/MarketingPageSections";
import { MarketingSectionHeader } from "../../components/MarketingSectionHeader";
import { buildFaqPageJsonLd, jsonLdScript } from "../../components/marketingFaqJsonLd";
import {
  buildFreeToolsBreadcrumbJsonLd,
  buildFreeToolsItemListJsonLd,
  FREE_TOOLS_FAQ_ITEMS,
  freeToolsMetadata,
  HUB_TOOLS,
} from "../../lib/freeToolsHub";
import {
  FreeToolsFaqStartFree,
  FreeToolsFilterTabs,
  FreeToolsGoViralBanner,
} from "./FreeToolsHubClient";
import styles from "./FreeToolsHub.module.css";
import "../homepage.css";

export const metadata = freeToolsMetadata;

export default function FreeToolsHubPage() {
  const faqJsonLd = buildFaqPageJsonLd(FREE_TOOLS_FAQ_ITEMS);

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildFreeToolsBreadcrumbJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildFreeToolsItemListJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
      />

      <MarketingHeader />

      <main>
        <section className={styles.hero}>
          <nav aria-label="Breadcrumb">
            <ol className={`${styles.breadcrumb} sr-text-marketing-body-small`}>
              <li>
                <a href="/">Home</a>
              </li>
              <li className={styles.breadcrumbSep} aria-hidden="true">
                /
              </li>
              <li className={styles.breadcrumbCurrent} aria-current="page">
                Free Tools
              </li>
            </ol>
          </nav>

          <MarketingHeroEyebrow>Free tools for Reels, TikTok and Shorts</MarketingHeroEyebrow>

          <h1 className="sr-text-marketing-display">SpyReels Free Tools</h1>

          <p className={`${styles.heroLead} sr-text-marketing-body-large`}>
            SpyReels Free Tools is a hub of free creator tools to find viral videos by username,
            generate hooks, match B-roll, and write scripts. Browse the tools below and start free.
          </p>

          <p className={`${styles.trust} sr-text-marketing-body-small`}>
            <span className={styles.trustStars} aria-hidden="true">
              <MarketingIconStar />
              <MarketingIconStar />
              <MarketingIconStar />
              <MarketingIconStar />
              <MarketingIconStar />
            </span>
            Trusted by 12,000+ creators
          </p>
        </section>

        <FreeToolsFilterTabs />

        <section id="tools" className={styles.toolsSection}>
          <div className={styles.toolsHeader}>
            <MarketingSectionHeader title="Popular tools" headingLevel="h2" size="large" align="start" />
            <p className={`${styles.toolsAside} sr-text-marketing-body-small`}>
              Start free on every tool
            </p>
          </div>

          <div
            id="free-tools-grid"
            className={styles.toolsGrid}
            data-active-filter="all"
          >
            {HUB_TOOLS.map((tool) => (
              <a
                key={tool.href}
                href={tool.href}
                className={styles.toolCard}
                data-category={tool.category}
                data-visible="true"
              >
                <div className={styles.toolMedia}>
                  <img
                    src={tool.imageSrc}
                    alt={tool.title}
                    width={tool.imageWidth}
                    height={tool.imageHeight}
                    loading="lazy"
                  />
                </div>
                <h3 className={`${styles.toolTitle} sr-text-product-card-title`}>{tool.title}</h3>
                <p className={`${styles.toolDescription} sr-text-marketing-body-small`}>
                  {tool.description}
                </p>
              </a>
            ))}
          </div>
        </section>

        <FreeToolsGoViralBanner />

        <MarketingFaq
          title="Frequently asked questions"
          description=""
          items={FREE_TOOLS_FAQ_ITEMS}
        />

        <FreeToolsFaqStartFree />
      </main>

      <MarketingFooter />
      <HomepageAuthGate />
    </div>
  );
}
