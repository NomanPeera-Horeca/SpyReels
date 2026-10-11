import { MarketingCard } from "../../../components/MarketingCard";
import { MarketingSection } from "../../../components/MarketingSection";
import { MarketingSectionHeader } from "../../../components/MarketingSectionHeader";
import { wrapHyphenatedCompounds } from "../../../components/marketingNoBreak";
import { VIRAL_HOOKS_TRAIT_CARDS } from "../../../lib/viralHooksCopy";
import { ViralHooksBeforeAfterSlider } from "./ViralHooksBeforeAfterSlider";
import { ViralHooksOneClickDemo } from "./ViralHooksOneClickDemo";
import styles from "./ViralHooksTool.module.css";
import pageStyles from "./ViralHooks.module.css";

export function ViralHooksOneClickSection() {
  return (
    <MarketingSection className="shell">
      <MarketingSectionHeader
        title="Generate a viral hook in one click"
        subtitle="Watch it: one tap drops scroll-stopping on-screen text on your Reel."
        headingLevel="h2"
        size="large"
        align="center"
      />
      <ViralHooksOneClickDemo />
    </MarketingSection>
  );
}

export function ViralHooksTraitSection() {
  return (
    <MarketingSection className="shell">
      <div className={pageStyles.sectionStack}>
        <MarketingSectionHeader
          eyebrow="Hooks"
          title="What makes a great viral hook?"
          subtitle="Short-form winners share the same four traits."
          headingLevel="h2"
          size="large"
          align="start"
        />
        <div className={styles.traitGrid}>
          {VIRAL_HOOKS_TRAIT_CARDS.map((card) => (
            <MarketingCard
              key={card.title}
              as="article"
              className={styles.traitCard}
            >
              <h3 className={`sr-text-marketing-heading-3 ${styles.traitTitle}`}>
                {wrapHyphenatedCompounds(card.title)}
              </h3>
              <p className={`sr-text-marketing-body-small ${styles.traitBody}`}>
                {wrapHyphenatedCompounds(card.body)}
              </p>
            </MarketingCard>
          ))}
        </div>
      </div>
    </MarketingSection>
  );
}

export function ViralHooksBeforeAfterSection() {
  return (
    <MarketingSection className="shell" aria-label="Before and after hook comparison">
      <ViralHooksBeforeAfterSlider />
    </MarketingSection>
  );
}
