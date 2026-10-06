import type { ReactNode } from "react";
import { PrimaryButton } from "./PrimaryButton";

type FaqItem = {
  q: string;
  a: string;
  afterLink?: { href: string; label: string };
};
type Tool = { id: string; title: string; description: string; href: string; icon: ReactNode };

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

const toolArrow = (
  // Icon / QA Arrow Right — vector icon, not a font glyph (Figma Marketing / Tool Grid).
  <img className="free-tool-arrow-icon" src="/marketing/platform-marks/arrow-right.svg" width={14} height={14} alt="" aria-hidden="true" />
);

const icons = {
  script: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h4M8 12h8M8 16h6"/></svg>,
  hooks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M18.4 5.6l-2.8 2.8m-7.2 7.2-2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg>,
  broll: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9ZM3 9h3M3 15h3M18 9h3M18 15h3"/></svg>,
  creators: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 19v-1a6 6 0 0 1 12 0v1H3Z"/><path d="M17 6a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4"/></svg>,
  carousel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M3 7v10m18-10v10M9 9h6m-6 4h6"/></svg>,
  finder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m10 8 6 4-6 4V8Z"/></svg>,
};

export const finderNextTools: Tool[] = [
  { id: "script", title: "AI Viral Script Generator", description: "Turn a strong Reel idea into a script in your voice.", href: "/free-tools/ai-script-generator", icon: icons.script },
  { id: "hooks", title: "Viral Hook Generator", description: "Give your opening a sharper hook.", href: "/free-tools/viral-hooks", icon: icons.hooks },
  { id: "broll", title: "B-roll Generator", description: "Plan the shots that support your script.", href: "/free-tools/broll-generator", icon: icons.broll },
  { id: "creators", title: "Find Creators", description: "Explore more creators in your niche.", href: "/?auth=signup&returnTo=%2Fdiscover-creators", icon: icons.creators },
  { id: "carousel", title: "Carousel Generator", description: "Turn the same idea into a swipeable post.", href: "/?auth=signup&returnTo=%2Fcarousels", icon: icons.carousel },
  { id: "tiktok", title: "TikTok Viral Video Finder", description: "Find more ideas on TikTok.", href: "/free-tools/tiktok-viral-video-finder", icon: icons.finder },
];

export const homepageWorkspaceTools: Tool[] = [
  { id: "creators", title: "Find Creators", description: "Discover creators in your niche.", href: "/?auth=signup&returnTo=%2Fdiscover-creators", icon: icons.creators },
  { id: "finder", title: "Viral Reel Finder", description: "Spot the Reels worth studying.", href: "/features/viral-reel-finder", icon: icons.finder },
  { id: "script", title: "AI Viral Script Generator", description: "Turn an idea into a viral script.", href: "/free-tools/ai-script-generator", icon: icons.script },
  { id: "hooks", title: "Viral Hook Generator", description: "Find a stronger opening.", href: "/free-tools/viral-hooks", icon: icons.hooks },
  { id: "broll", title: "B-roll Generator", description: "Plan what viewers will see.", href: "/free-tools/broll-generator", icon: icons.broll },
  { id: "carousel", title: "Carousel Generator", description: "Make your idea swipeable.", href: "/?auth=signup&returnTo=%2Fcarousels", icon: icons.carousel },
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
  tools: Tool[];
  /** Finder pages use standalone shell; homepage nests inside growth-section. */
  layout?: "standalone" | "embedded";
  titleHeadingLevel?: "h2" | "h3";
  extensionsHeadingLevel?: "h3" | "h4";
  freeToolsId?: string;
  extensionsAriaLabel?: string;
};

function MarketingWorkspaceBody({
  title,
  tools,
  titleHeadingLevel,
  extensionsHeadingLevel,
  freeToolsId,
  extensionsAriaLabel,
}: Required<
  Pick<
    MarketingWorkspaceProps,
    "title" | "tools" | "titleHeadingLevel" | "extensionsHeadingLevel" | "extensionsAriaLabel"
  >
> &
  Pick<MarketingWorkspaceProps, "freeToolsId">) {
  const TitleTag = titleHeadingLevel;
  const ExtensionsTitleTag = extensionsHeadingLevel;
  const titleId = titleHeadingLevel === "h2" ? "finder-workspace-title" : undefined;

  return (
    <div className="free-tools" id={freeToolsId}>
      <div className="free-tools-heading">
        <div>
          <span className="kicker">Everything in one workspace</span>
          <TitleTag {...(titleId ? { id: titleId } : {})}>{title}</TitleTag>
        </div>
      </div>
      <div className="free-tools-grid">
        {tools.map((tool) => (
          <a className="free-tool" id={`tool-${tool.id}`} href={tool.href} key={tool.id}>
            <span className="free-tool-icon" aria-hidden="true">
              {tool.icon}
            </span>
            <span className="free-tool-copy">
              <strong>{tool.title}</strong>
              <small>{tool.description}</small>
            </span>
            <span className="free-tool-arrow" aria-hidden="true">
              {toolArrow}
            </span>
          </a>
        ))}
      </div>
      <div className="workflow-extensions" aria-label={extensionsAriaLabel}>
        <div className="workflow-extensions-intro">
          <span className="kicker">Beyond the workspace</span>
          <ExtensionsTitleTag>Your ideas travel with you.</ExtensionsTitleTag>
          <p>Save inspiration wherever you find it and bring SpyReels research into your writing flow.</p>
        </div>
        <div className="extension-card telegram" id="telegram-extension">
          <span className="extension-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.4 3.1 2.8 10.3c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.7c.2.7.1 1 1 .9.7-.1 1-.3 1.4-.7l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9L23 4.4c.3-1.3-.5-1.8-1.6-1.3ZM8.1 12.9l10.9-6.8c.5-.3 1-.1.6.3l-9 8.1-.4 4.1-2.1-5.7Z" />
            </svg>
          </span>
          <div>
            <strong>Save Reels with Telegram</strong>
            <p>Send a Reel while you browse. Pick it up later in your SpyReels workspace.</p>
          </div>
          <span className="extension-status live">Available now</span>
        </div>
        <div className="extension-card" id="ai-extension">
          <span className="extension-icon" aria-hidden="true">
            ✦
          </span>
          <div>
            <strong>SpyReels in ChatGPT and Claude</strong>
            <p>Bring SpyReels viral-post research into the conversation where you develop ideas.</p>
          </div>
          <span className="extension-status">Coming soon</span>
        </div>
      </div>
    </div>
  );
}

export function MarketingWorkspace({
  title,
  tools,
  layout = "standalone",
  titleHeadingLevel = layout === "embedded" ? "h3" : "h2",
  extensionsHeadingLevel = layout === "embedded" ? "h4" : "h3",
  freeToolsId,
  extensionsAriaLabel = layout === "embedded" ? "Upcoming ways to use SpyReels" : "Other ways to use SpyReels",
}: MarketingWorkspaceProps) {
  const body = (
    <MarketingWorkspaceBody
      title={title}
      tools={tools}
      titleHeadingLevel={titleHeadingLevel}
      extensionsHeadingLevel={extensionsHeadingLevel}
      freeToolsId={freeToolsId}
      extensionsAriaLabel={extensionsAriaLabel}
    />
  );

  if (layout === "embedded") {
    return body;
  }

  return (
    <section className="shell finder-workspace" aria-labelledby="finder-workspace-title">
      {body}
    </section>
  );
}

export function MarketingFaq({ title, description, items }: { title: string; description: string; items: readonly FaqItem[] }) {
  return <section className="seo-block" id="faq"><div className="shell answer-grid"><div className="answer-sticky"><span className="kicker">Frequently asked questions</span><h2>{title}</h2><p>{description}</p></div><div className="answers">{items.map((item, index) => <details key={item.q} open={index === 0}><summary>{item.q}</summary><p>{item.a}</p>{item.afterLink ? <p><a href={item.afterLink.href}>{item.afterLink.label} →</a></p> : null}</details>)}</div></div></section>;
}

export function MarketingFinalCta({ title, description, label, href }: { title: string; description: string; label: string; href: string }) {
  return (
    <section className="cta">
      <div className="shell">
        <div className="cta-box">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <PrimaryButton href={href} size="large" glow>
            {label} <span aria-hidden="true">→</span>
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
