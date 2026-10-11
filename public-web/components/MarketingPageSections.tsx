import { marketingSharedCopy } from "../lib/marketingSharedCopy";
import { PrimaryButton } from "./PrimaryButton";
import { MarketingSection } from "./MarketingSection";
import { MarketingSectionHeader } from "./MarketingSectionHeader";
import {
  MarketingIconArrowRight,
  MarketingIconMinus,
  MarketingIconPlus,
  MarketingIconSparkle,
  MarketingIconTelegram,
  MarketingToolIcon,
} from "./MarketingIcons";
import {
  resolveMarketingTools,
  type MarketingToolId,
  type MarketingToolsPage,
} from "./marketingTools";
import styles from "./MarketingToolGrid.module.css";
import faqStyles from "./MarketingFaq.module.css";
import finalCtaStyles from "./MarketingFinalCta.module.css";
import platformStripStyles from "./MarketingPlatformStrip.module.css";
import type { MarketingFaqItem } from "./marketingFaqJsonLd";

export { MarketingResponsibleResearch } from "./MarketingResponsibleResearch";
export { MarketingCreatorStories } from "./MarketingCreatorStories";

const channels = [
  {
    name: "Instagram Reels",
    href: "/features/viral-reel-finder",
    markSrc: "/marketing/platform-marks/instagram.svg",
    markWidth: 32,
    markHeight: 32,
    markClass: platformStripStyles.mark,
  },
  {
    name: "TikTok",
    href: "/free-tools/tiktok-viral-video-finder",
    markSrc: "/marketing/platform-marks/tiktok.svg",
    markWidth: 32,
    markHeight: 32,
    markClass: platformStripStyles.mark,
  },
  {
    name: "YouTube Shorts",
    href: "/free-tools/youtube-shorts-viral-finder",
    markSrc: "/marketing/platform-marks/youtube.svg",
    markWidth: 38,
    markHeight: 32,
    markClass: `${platformStripStyles.mark} ${platformStripStyles.markYoutube}`,
  },
] as const;

/**
 * Marketing / Platform Strip (Figma Page 09).
 * Large/Center header + Page 05 full-color platform marks.
 */
export function MarketingPlatformStrip() {
  const titleId = "platform-strip-title";

  return (
    <MarketingSection
      className={platformStripStyles.section}
      aria-labelledby={titleId}
      data-marketing-platform-strip=""
    >
      <div className={platformStripStyles.shell}>
        <MarketingSectionHeader
          className={platformStripStyles.header}
          title="One workflow for every short-form channel."
          headingLevel="h2"
          titleId={titleId}
          size="large"
          align="center"
        />
        <div className={platformStripStyles.card} aria-label="Supported short-form platforms">
          {channels.map((channel) => (
            <a key={channel.name} className={platformStripStyles.platform} href={channel.href}>
              <img
                className={channel.markClass}
                src={channel.markSrc}
                width={channel.markWidth}
                height={channel.markHeight}
                alt=""
                aria-hidden="true"
                data-platform-mark={channel.name}
              />
              <span className={`sr-text-marketing-title-medium ${platformStripStyles.label}`}>
                {channel.name}
              </span>
            </a>
          ))}
        </div>
      </div>
    </MarketingSection>
  );
}

type MarketingWorkspaceProps = {
  title: string;
  /** Selects tool order + live descriptions for this page. */
  toolsPage: MarketingToolsPage;
  /** Tool ids to omit (e.g. hide the page's own finder). */
  hiddenToolIds?: readonly MarketingToolId[];
  /** Finder pages use standalone shell; homepage nests inside .homepage-tools-band. */
  layout?: "standalone" | "embedded";
  titleHeadingLevel?: "h2" | "h3";
  extensionsHeadingLevel?: "h3" | "h4";
  freeToolsId?: string;
  extensionsAriaLabel?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function MarketingWorkspace({
  title,
  toolsPage,
  hiddenToolIds = [],
  layout = "standalone",
  titleHeadingLevel = layout === "embedded" ? "h3" : "h2",
  extensionsHeadingLevel = layout === "embedded" ? "h4" : "h3",
  freeToolsId,
  extensionsAriaLabel = layout === "embedded" ? "Upcoming ways to use SpyReels" : "Other ways to use SpyReels",
}: MarketingWorkspaceProps) {
  const tools = resolveMarketingTools(toolsPage, hiddenToolIds);
  const titleId = titleHeadingLevel === "h2" ? "finder-workspace-title" : undefined;

  const toolsInner = (
    <div className={cx("shell", styles.root)} id={freeToolsId}>
      <MarketingSectionHeader
        eyebrow="Everything in one workspace"
        title={title}
        headingLevel={titleHeadingLevel}
        titleId={titleId}
        size="large"
        align="start"
      />

      <div className={styles.tools}>
        {tools.map((tool) => (
          <a className={styles.tool} id={`tool-${tool.id}`} href={tool.href} key={tool.id}>
            <span className={styles.iconTile} aria-hidden="true">
              <MarketingToolIcon name={tool.icon} />
            </span>
            <span className={styles.copy}>
              <strong className={cx(styles.title, "sr-text-product-card-title")}>{tool.title}</strong>
              <small className={cx(styles.description, "sr-text-marketing-body-small")}>
                {tool.description}
              </small>
            </span>
            <span className={styles.arrow} aria-hidden="true">
              <MarketingIconArrowRight />
            </span>
          </a>
        ))}
      </div>
    </div>
  );

  const beyondInner = (
    <div className={cx("shell", styles.beyond)}>
      <MarketingSectionHeader
        eyebrow="Beyond the workspace"
        title="Your ideas travel with you."
        subtitle="Save inspiration wherever you find it and bring SpyReels research into your writing flow."
        headingLevel={extensionsHeadingLevel}
        size="large"
        align="start"
      />
      <div className={styles.integrations}>
        <div className={styles.integration} id="telegram-extension">
          <span className={styles.iconTile} aria-hidden="true">
            <MarketingIconTelegram />
          </span>
          <div className={styles.integrationCopy}>
            <div className={styles.integrationTitleRow}>
              <strong className={cx(styles.integrationTitle, "sr-text-product-card-title")}>
                {marketingSharedCopy.integrations.telegramTitle}
              </strong>
            </div>
            <p className={cx(styles.integrationDescription, "sr-text-marketing-body-small")}>
              {marketingSharedCopy.integrations.telegram}
            </p>
          </div>
        </div>
        <div className={styles.integration} id="ai-extension">
          <span className={styles.iconTile} aria-hidden="true">
            <MarketingIconSparkle />
          </span>
          <div className={styles.integrationCopy}>
            <div className={styles.integrationTitleRow}>
              <strong className={cx(styles.integrationTitle, "sr-text-product-card-title")}>
                {marketingSharedCopy.integrations.aiTitle}
              </strong>
              <span className={cx(styles.badge, "sr-text-marketing-caption")}>Coming soon</span>
            </div>
            <p className={cx(styles.integrationDescription, "sr-text-marketing-body-small")}>
              {marketingSharedCopy.integrations.ai}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <MarketingSection
        pair="end"
        aria-labelledby={titleId}
        data-marketing-tool-grid=""
      >
        {toolsInner}
      </MarketingSection>
      <MarketingSection
        pair="start"
        aria-label={extensionsAriaLabel}
        data-marketing-beyond=""
      >
        {beyondInner}
      </MarketingSection>
    </>
  );
}

export function MarketingFaq({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: readonly MarketingFaqItem[];
}) {
  return (
    <MarketingSection className={faqStyles.section} id="faq" data-marketing-faq="">
      <div className={cx("shell", faqStyles.grid)}>
        <div className={faqStyles.sticky}>
          <MarketingSectionHeader
            eyebrow="Frequently asked questions"
            title={title}
            subtitle={description}
            headingLevel="h2"
            size="large"
            align="start"
          />
        </div>
        <div className={faqStyles.list}>
          {items.map((item, index) => (
            <details key={item.q} className={faqStyles.item} open={index === 0}>
              <summary className={faqStyles.summary}>
                <span className={cx("sr-text-marketing-title-medium", faqStyles.question)}>{item.q}</span>
                <span className={faqStyles.icon} aria-hidden="true">
                  <MarketingIconPlus className={faqStyles.iconPlus} />
                  <MarketingIconMinus className={faqStyles.iconMinus} />
                </span>
              </summary>
              <div className={faqStyles.answer}>
                <p className={cx("sr-text-marketing-body-medium", faqStyles.answerText)}>{item.a}</p>
                {item.afterLink ? (
                  <a href={item.afterLink.href} className={cx("sr-text-marketing-body-medium", faqStyles.link)}>
                    <span>{item.afterLink.label}</span>
                    <MarketingIconArrowRight className={faqStyles.linkIcon} />
                  </a>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </div>
    </MarketingSection>
  );
}

export function MarketingFinalCta({
  title,
  body,
  buttonLabel,
  href,
  id,
}: {
  title: string;
  body: string;
  buttonLabel: string;
  href: string;
  /** Optional anchor id (homepage keeps id="pricing"). */
  id?: string;
}) {
  return (
    <MarketingSection id={id} data-marketing-final-cta="">
      <div className={finalCtaStyles.shell}>
        <div className={finalCtaStyles.box}>
          <div className={finalCtaStyles.copy}>
            <h2 className={cx("sr-text-marketing-heading-2", finalCtaStyles.title)}>{title}</h2>
            <p className={cx("sr-text-marketing-body-large", finalCtaStyles.body)}>{body}</p>
          </div>
          <PrimaryButton
            href={href}
            size="large"
            className={finalCtaStyles.button}
            data-marketing-primary-button="final-cta"
          >
            {buttonLabel}
          </PrimaryButton>
        </div>
      </div>
    </MarketingSection>
  );
}
