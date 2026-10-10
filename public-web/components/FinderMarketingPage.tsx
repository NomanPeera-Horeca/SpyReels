import {
  MarketingFinderMotion,
  MarketingFooter,
  MarketingHeader,
} from "./MarketingChrome";
import {
  MarketingFaq,
  MarketingFinalCta,
  MarketingPlatformStrip,
  MarketingWorkspace,
} from "./MarketingPageSections";
import { buildFaqPageJsonLd, jsonLdScript } from "./marketingFaqJsonLd";
import { HomepageAuthGate } from "./HomepageAuthGate";
import { MarketingHeroEyebrow } from "./MarketingHeroEyebrow";
import { MarketingHowItWorksSection } from "./MarketingHowItWorksSection";
import { PlatformFinderExperience } from "./PlatformFinderExperience";
import type { FinderConfig } from "../lib/finderConfigs/types";
import styles from "./FinderMarketingPage.module.css";

export function FinderMarketingPage({ config }: { config: FinderConfig }) {
  const { hero, howItWorks, workspace, faq, finalCta, jsonLd } = config;
  const faqJsonLd = buildFaqPageJsonLd(faq.items);

  return (
    <div className={styles.page} data-finder-platform={config.platform}>
      {jsonLd.breadcrumb ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd.breadcrumb) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd.software) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
      />

      <MarketingHeader />

      <main>
        <section className={`${styles.shell} ${styles.hero}`} data-marketing-finder-hero="">
          <MarketingHeroEyebrow>{hero.eyebrow}</MarketingHeroEyebrow>
          <h1 className="sr-text-marketing-display-hero">
            {hero.titleBefore}
            <span className={styles.accent}>viral</span>
            {hero.titleAfter}
          </h1>
          <p className={`sr-text-marketing-body-large ${styles.heroLead}`}>{hero.lead}</p>
          <PlatformFinderExperience
            platform={config.platform}
            styles={{
              experience: styles.experience,
              finderIsland: styles.finderIsland,
              tryRow: styles.tryRow,
              examples: styles.examples,
              demoHandleActive: styles.demoHandleActive,
            }}
          />
        </section>

        <section className={styles.motionStage} aria-label="See the SpyReels workflow">
          <div className={styles.motionFrame}>
            <MarketingFinderMotion />
          </div>
        </section>

        <MarketingPlatformStrip />

        <MarketingHowItWorksSection
          className={styles.howItWorksAnchor}
          title={howItWorks.title}
          description={howItWorks.description}
          steps={howItWorks.steps}
        />

        <MarketingWorkspace toolsPage={workspace.toolsPage} title={workspace.title} />

        <MarketingFaq title={faq.title} description={faq.description} items={faq.items} />

        <MarketingFinalCta
          title={finalCta.title}
          body={finalCta.body}
          buttonLabel={finalCta.buttonLabel}
          href={finalCta.href}
        />
      </main>

      <MarketingFooter />
      <HomepageAuthGate />
    </div>
  );
}
