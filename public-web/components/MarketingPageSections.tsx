import { PrimaryButton } from "./PrimaryButton";
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
import type { MarketingFaqItem } from "./marketingFaqJsonLd";

const officialPlatformMark = (src: string, width: number, height: number, alt: string) => (
  // Official platform marks from Marketing / Platform Strip (Figma Page 09).
  <img src={src} width={width} height={height} alt="" aria-hidden="true" data-platform-mark={alt} />
);

const channels = [
  {
    name: "Instagram Reels",
    href: "/features/viral-reel-finder",
    className: "instagram",
    icon: officialPlatformMark("/marketing/platform-marks/instagram.svg", 32, 32, "Instagram"),
  },
  {
    name: "TikTok",
    href: "/free-tools/tiktok-viral-video-finder",
    className: "tiktok",
    icon: officialPlatformMark("/marketing/platform-marks/tiktok.svg", 32, 32, "TikTok"),
  },
  {
    name: "YouTube Shorts",
    href: "/free-tools/youtube-shorts-viral-finder",
    className: "youtube",
    icon: officialPlatformMark("/marketing/platform-marks/youtube.svg", 38, 32, "YouTube"),
  },
];

export function MarketingPlatformStrip() {
  return (
    <section className="trusted" aria-label="Short-form channels">
      <div className="shell">
        <h2>One workflow for every short-form channel.</h2>
        <div className="platform-strip">
          <div className="platform-logos" aria-label="Supported short-form platforms">
            {channels.map((channel) => (
              <a key={channel.name} className={`platform-logo ${channel.className}`} href={channel.href}>
                {channel.icon}
                <span>{channel.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
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

function MarketingWorkspaceBody({
  title,
  toolsPage,
  hiddenToolIds,
  titleHeadingLevel,
  extensionsHeadingLevel,
  freeToolsId,
  extensionsAriaLabel,
  layout,
}: Required<
  Pick<
    MarketingWorkspaceProps,
    | "title"
    | "toolsPage"
    | "titleHeadingLevel"
    | "extensionsHeadingLevel"
    | "extensionsAriaLabel"
    | "layout"
  >
> &
  Pick<MarketingWorkspaceProps, "freeToolsId" | "hiddenToolIds">) {
  const tools = resolveMarketingTools(toolsPage, hiddenToolIds);
  const titleId = titleHeadingLevel === "h2" ? "finder-workspace-title" : undefined;

  return (
    <div
      className={cx(styles.root, layout === "embedded" && styles.rootEmbedded)}
      id={freeToolsId}
    >
      <MarketingSectionHeader
        eyebrow="Everything in one workspace"
        title={title}
        headingLevel={titleHeadingLevel}
        titleId={titleId}
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

      <div className={styles.beyond} aria-label={extensionsAriaLabel}>
        <MarketingSectionHeader
          eyebrow="Beyond the workspace"
          title="Your ideas travel with you."
          subtitle="Save inspiration wherever you find it and bring SpyReels research into your writing flow."
          headingLevel={extensionsHeadingLevel}
        />
        <div className={styles.integrations}>
          <div className={styles.integration} id="telegram-extension">
            <span className={styles.iconTile} aria-hidden="true">
              <MarketingIconTelegram />
            </span>
            <div className={styles.integrationCopy}>
              <div className={styles.integrationTitleRow}>
                <strong className={cx(styles.integrationTitle, "sr-text-product-card-title")}>
                  Save Reels with Telegram
                </strong>
              </div>
              <p className={cx(styles.integrationDescription, "sr-text-marketing-body-small")}>
                Send a Reel while you browse. Pick it up later in your SpyReels workspace.
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
                  SpyReels in ChatGPT and Claude
                </strong>
                <span className={cx(styles.badge, "sr-text-marketing-caption")}>Coming soon</span>
              </div>
              <p className={cx(styles.integrationDescription, "sr-text-marketing-body-small")}>
                Bring SpyReels viral-post research into the conversation where you develop ideas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  const body = (
    <MarketingWorkspaceBody
      title={title}
      toolsPage={toolsPage}
      hiddenToolIds={hiddenToolIds}
      titleHeadingLevel={titleHeadingLevel}
      extensionsHeadingLevel={extensionsHeadingLevel}
      freeToolsId={freeToolsId}
      extensionsAriaLabel={extensionsAriaLabel}
      layout={layout}
    />
  );

  if (layout === "embedded") {
    // Same centered max-width + page gutters as other homepage / finder shells.
    return <div className="shell">{body}</div>;
  }

  return (
    <section
      className={cx("shell", styles.sectionStandalone)}
      aria-labelledby="finder-workspace-title"
    >
      {body}
    </section>
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
    <section className={faqStyles.section} id="faq">
      <div className={cx("shell", faqStyles.grid)}>
        <div className={faqStyles.sticky}>
          <MarketingSectionHeader
            eyebrow="Frequently asked questions"
            title={title}
            subtitle={description}
            headingLevel="h2"
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
    </section>
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
    <section className={finalCtaStyles.section} id={id} data-marketing-final-cta="">
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
    </section>
  );
}
