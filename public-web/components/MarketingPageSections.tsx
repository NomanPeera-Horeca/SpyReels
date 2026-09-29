import type { ReactNode } from "react";

type FaqItem = {
  q: string;
  a: string;
  afterLink?: { href: string; label: string };
};
type Tool = { id: string; title: string; description: string; href: string; icon: ReactNode };

const channels = [
  { name: "Instagram Reels", href: "/features/viral-reel-finder", className: "instagram", icon: <svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="marketing-instagram-gradient" x1="2" y1="30" x2="30" y2="2" gradientUnits="userSpaceOnUse"><stop stopColor="#FFD600"/><stop offset=".45" stopColor="#FF0169"/><stop offset="1" stopColor="#D300C5"/></linearGradient></defs><rect x="3" y="3" width="26" height="26" rx="8" fill="url(#marketing-instagram-gradient)"/><circle cx="16" cy="16" r="6" fill="none" stroke="white" strokeWidth="2.3"/><circle cx="23.3" cy="8.8" r="1.5" fill="white"/></svg> },
  { name: "TikTok", href: "/free-tools/tiktok-viral-video-finder", className: "tiktok", icon: <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18.2 5.5c.6 3.2 2.5 5.1 5.7 5.7v4.1a12.2 12.2 0 0 1-5.7-1.7v7.2a7.3 7.3 0 1 1-6.3-7.2v4.2a3.2 3.2 0 1 0 2.2 3V5.5h4.1Z" fill="#25F4EE" transform="translate(-1 1)"/><path d="M19.2 4.5c.6 3.2 2.5 5.1 5.7 5.7v4.1a12.2 12.2 0 0 1-5.7-1.7v7.2a7.3 7.3 0 1 1-6.3-7.2v4.2a3.2 3.2 0 1 0 2.2 3V4.5h4.1Z" fill="#FE2C55" transform="translate(1 -1)"/><path d="M19.2 4.5c.6 3.2 2.5 5.1 5.7 5.7v4.1a12.2 12.2 0 0 1-5.7-1.7v7.2a7.3 7.3 0 1 1-6.3-7.2v4.2a3.2 3.2 0 1 0 2.2 3V4.5h4.1Z" fill="#16141B"/></svg> },
  { name: "YouTube Shorts", href: "/free-tools/youtube-shorts-viral-finder", className: "youtube", icon: <svg viewBox="0 0 38 32" aria-hidden="true"><path d="M36.8 9.1a4.7 4.7 0 0 0-3.3-3.4C30.6 5 19 5 19 5S7.4 5 4.5 5.7A4.7 4.7 0 0 0 1.2 9.1C.5 12 .5 16 .5 16s0 4 .7 6.9a4.7 4.7 0 0 0 3.3 3.4C7.4 27 19 27 19 27s11.6 0 14.5-.7a4.7 4.7 0 0 0 3.3-3.4c.7-2.9.7-6.9.7-6.9s0-4-.7-6.9Z" fill="#FF0033"/><path d="m15.3 21.2 9.7-5.2-9.7-5.2v10.4Z" fill="white"/></svg> },
];

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

export function MarketingPlatformStrip() {
  return <section className="trusted" aria-label="Short-form channels"><div className="shell"><h2>One workflow for every short-form channel.</h2><div className="platform-strip"><div className="platform-logos">{channels.map(channel => <a key={channel.name} className={`platform-logo ${channel.className}`} href={channel.href}>{channel.icon}<span>{channel.name}</span></a>)}</div></div></div></section>;
}

export function MarketingWorkspace({ title, tools }: { title: string; tools: Tool[] }) {
  return <section className="shell finder-workspace" aria-labelledby="finder-workspace-title"><div className="free-tools"><div className="free-tools-heading"><div><span className="kicker">Everything in one workspace</span><h2 id="finder-workspace-title">{title}</h2></div></div><div className="free-tools-grid">{tools.map(tool => <a className="free-tool" id={`tool-${tool.id}`} href={tool.href} key={tool.id}><span className="free-tool-icon" aria-hidden="true">{tool.icon}</span><span className="free-tool-copy"><strong>{tool.title}</strong><small>{tool.description}</small></span><span className="free-tool-arrow" aria-hidden="true">→</span></a>)}</div><div className="workflow-extensions" aria-label="Other ways to use SpyReels"><div className="workflow-extensions-intro"><span className="kicker">Beyond the workspace</span><h3>Your ideas travel with you.</h3><p>Save inspiration wherever you find it and bring SpyReels research into your writing flow.</p></div><div className="extension-card telegram" id="telegram-extension"><span className="extension-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 3.1 2.8 10.3c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.7c.2.7.1 1 1 .9.7-.1 1-.3 1.4-.7l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9L23 4.4c.3-1.3-.5-1.8-1.6-1.3ZM8.1 12.9l10.9-6.8c.5-.3 1-.1.6.3l-9 8.1-.4 4.1-2.1-5.7Z"/></svg></span><div><strong>Save Reels with Telegram</strong><p>Send a Reel while you browse. Pick it up later in your SpyReels workspace.</p></div><span className="extension-status live">Available now</span></div><div className="extension-card" id="ai-extension"><span className="extension-icon" aria-hidden="true">✦</span><div><strong>SpyReels in ChatGPT and Claude</strong><p>Bring SpyReels viral-post research into the conversation where you develop ideas.</p></div><span className="extension-status">Coming soon</span></div></div></div></section>;
}

export function MarketingFaq({ title, description, items }: { title: string; description: string; items: readonly FaqItem[] }) {
  return <section className="seo-block" id="faq"><div className="shell answer-grid"><div className="answer-sticky"><span className="kicker">Frequently asked questions</span><h2>{title}</h2><p>{description}</p></div><div className="answers">{items.map((item, index) => <details key={item.q} open={index === 0}><summary>{item.q}</summary><p>{item.a}</p>{item.afterLink ? <p><a href={item.afterLink.href}>{item.afterLink.label} →</a></p> : null}</details>)}</div></div></section>;
}

export function MarketingFinalCta({ title, description, label, href }: { title: string; description: string; label: string; href: string }) {
  return <section className="cta"><div className="shell"><div className="cta-box"><div><h2>{title}</h2><p>{description}</p></div><a className="btn btn-violet" href={href}>{label} <span aria-hidden="true">→</span></a></div></div></section>;
}
