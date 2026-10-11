import { MarketingCard } from "../../../components/MarketingCard";
import {
  MarketingIconArrowRight,
  MarketingToolIcon,
} from "../../../components/MarketingIcons";
import { MarketingSection } from "../../../components/MarketingSection";
import { MarketingSectionHeader } from "../../../components/MarketingSectionHeader";
import { wrapHyphenatedCompounds } from "../../../components/marketingNoBreak";
import toolGridStyles from "../../../components/MarketingToolGrid.module.css";
import { VIRAL_HOOKS_TRAIT_CARDS } from "../../../lib/viralHooksCopy";
import { ViralHooksBeforeAfterSlider } from "./ViralHooksBeforeAfterSlider";
import { ViralHooksOneClickDemo } from "./ViralHooksOneClickDemo";
import styles from "./ViralHooksTool.module.css";
import pageStyles from "./ViralHooks.module.css";

/** Same three tools and heading as the old SPA RelatedToolsGrid. */
const VIRAL_HOOKS_RELATED_TOOLS = [
  {
    id: "finder",
    title: "Viral Reel Finder",
    href: "/features/viral-reel-finder",
    icon: "finder" as const,
    description: "Spot the Reels worth studying.",
  },
  {
    id: "tiktok",
    title: "TikTok Viral Finder",
    href: "/free-tools/tiktok-viral-video-finder",
    icon: "finder" as const,
    description: "Find more ideas on TikTok.",
  },
  {
    id: "broll",
    title: "AI B-Roll Generator",
    href: "/free-tools/broll-generator",
    icon: "broll" as const,
    description: "Plan the shots that support your script.",
  },
] as const;

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

/** Tool Grid cards only (no Beyond the workspace). Same tools as the old page. */
export function ViralHooksRelatedTools() {
  return (
    <MarketingSection
      pair="end"
      aria-labelledby="viral-hooks-related-tools-title"
      data-marketing-tool-grid=""
    >
      <div className={`shell ${toolGridStyles.root}`}>
        <MarketingSectionHeader
          title="Other free creator tools"
          subtitle="Improve views with research and remake tools that sit next to this generator."
          headingLevel="h2"
          titleId="viral-hooks-related-tools-title"
          size="large"
          align="start"
        />
        <div className={toolGridStyles.tools}>
          {VIRAL_HOOKS_RELATED_TOOLS.map((tool) => (
            <a
              className={toolGridStyles.tool}
              id={`tool-${tool.id}`}
              href={tool.href}
              key={tool.id}
            >
              <span className={toolGridStyles.iconTile} aria-hidden="true">
                <MarketingToolIcon name={tool.icon} />
              </span>
              <span className={toolGridStyles.copy}>
                <strong className={`${toolGridStyles.title} sr-text-product-card-title`}>
                  {wrapHyphenatedCompounds(tool.title)}
                </strong>
                <small
                  className={`${toolGridStyles.description} sr-text-marketing-body-small`}
                >
                  {wrapHyphenatedCompounds(tool.description)}
                </small>
              </span>
              <span className={toolGridStyles.arrow} aria-hidden="true">
                <MarketingIconArrowRight />
              </span>
            </a>
          ))}
        </div>
      </div>
    </MarketingSection>
  );
}
