import {
  MarketingFooter,
  MarketingHeader,
} from "../../components/MarketingChrome";
import { HomepageAuthGate } from "../../components/HomepageAuthGate";
import { MarketingBreadcrumb } from "../../components/MarketingBreadcrumb";
import { MarketingHeroEyebrow } from "../../components/MarketingHeroEyebrow";
import { MarketingFaq } from "../../components/MarketingPageSections";
import { MarketingSection } from "../../components/MarketingSection";
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
        <MarketingSection pair="end" className={`shell ${styles.hero}`}>
          <MarketingBreadcrumb
            align="center"
            items={[{ label: "Home", href: "/" }, { label: "Free Tools" }]}
          />

          <MarketingHeroEyebrow>Free tools for creators</MarketingHeroEyebrow>

          <h1 className="sr-text-marketing-display">SpyReels Free Tools</h1>

          <p className={`${styles.heroLead} sr-text-marketing-body-large`}>
            SpyReels Free Tools is a hub of free creator tools to find viral videos by username,
            generate hooks, match B-roll, and write scripts. Browse the tools below and start free.
          </p>
        </MarketingSection>

        <MarketingSection id="tools" pair="start" className="shell">
          <FreeToolsFilterTabs />
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
        </MarketingSection>

        <MarketingSection className="shell" aria-label="Go viral CTA">
          <FreeToolsGoViralBanner />
        </MarketingSection>

        <MarketingFaq
          title="Frequently asked questions"
          description=""
          items={FREE_TOOLS_FAQ_ITEMS}
        />

        <MarketingSection pair="start" className={`shell ${styles.faqCta}`}>
          <FreeToolsFaqStartFree />
        </MarketingSection>
      </main>

      <MarketingFooter />
      <HomepageAuthGate />
    </div>
  );
}
