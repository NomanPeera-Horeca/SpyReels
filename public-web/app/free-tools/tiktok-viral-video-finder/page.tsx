import type { Metadata } from "next";
import Script from "next/script";
import { MarketingFinderMotion, MarketingFooter, MarketingHeader } from "../../../components/MarketingChrome";
import { MarketingFaq, MarketingFinalCta, MarketingPlatformStrip, MarketingWorkspace } from "../../../components/MarketingPageSections";
import { HomepageAuthGate } from "../../../components/HomepageAuthGate";
import { MarketingHeroEyebrow } from "../../../components/MarketingHeroEyebrow";
import {
  MarketingHowItWorksSection,
  type MarketingHowItWorksStep,
} from "../../../components/MarketingHowItWorksSection";
import TikTokFinderExperience from "./TikTokFinderExperience";
import "../../homepage.css";
import styles from "./page.module.css";

const canonical = "https://spyreels.ai/free-tools/tiktok-viral-video-finder";
const title = "TikTok Viral Video Finder by Username | SpyReels";
const description = "Find viral TikTok videos from a public creator. Compare views and engagement, then turn a strong idea into an original script in your voice with SpyReels.";

export const metadata: Metadata = {
  title, description, alternates: { canonical },
  openGraph: { type: "website", url: canonical, siteName: "SpyReels", title, description },
  twitter: { card: "summary_large_image", title, description },
};

const faqs = [
  { q: "What is a TikTok viral video finder?", a: "A TikTok viral video finder helps you research public videos from a creator account and compare which posts performed best. SpyReels lets you search by creator handle, study standout videos, and take a promising idea into your own script workflow." },
  { q: "Can I search a public TikTok account by username?", a: "Yes. Enter a public TikTok username or profile link. Select a featured creator to preview public video results, or sign in to research another account in SpyReels." },
  { q: "How does SpyReels identify a standout video?", a: "Compare public view counts and engagement with a creator’s other posts. This helps you spot videos worth studying without assuming that one metric alone explains why a video worked." },
  { q: "What can I do after finding a strong TikTok?", a: "Study the opening, pacing, and structure. In SpyReels you can use that research to write an original script in your own voice and plan what to film." },
  { q: "Can I use a TikTok idea for Instagram Reels or YouTube Shorts?", a: "Yes. Use the useful pattern as research, then adapt your own story and edit for the channel where you will publish." },
] as const;

const HOW_IT_WORKS_STEPS: readonly [
  MarketingHowItWorksStep,
  MarketingHowItWorksStep,
  MarketingHowItWorksStep,
] = [
  {
    number: "01",
    title: "Search a creator",
    body: "Start with a TikTok account in your niche, or explore one you already follow.",
  },
  {
    number: "02",
    title: "Find the videos that broke through",
    body: "Compare public videos by views, engagement, and performance relative to that creator's typical posts.",
  },
  {
    number: "03",
    title: "Make the idea yours",
    body: "Study the opening and structure, then turn the insight into a script in your own voice.",
  },
];

const tools = [
  { id: "script", title: "AI Viral Script Generator", description: "Turn a strong TikTok idea into a script in your voice", href: "/free-tools/ai-script-generator", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3h10l4 4v14H5V3Z M15 3v5h4 M8 12h8 M8 16h6"/></svg> },
  { id: "hooks", title: "Viral Hook Generator", description: "Give the opening a stronger reason to watch", href: "/free-tools/viral-hooks", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M18.4 5.6l-2.8 2.8m-7.2 7.2-2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg> },
  { id: "broll", title: "B-roll Generator", description: "Plan the shots that support your script", href: "/free-tools/broll-generator", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg> },
  { id: "finder", title: "Viral Reel Finder", description: "Research what works on Instagram Reels", href: "/features/viral-reel-finder", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m10 8 6 4-6 4V8Z"/></svg> },
  { id: "creators", title: "Find Creators", description: "Explore more creators in your niche", href: "/?auth=signup&returnTo=%2Fdiscover-creators", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3"/><path d="M3 19v-1a6 6 0 0 1 12 0v1H3Z"/></svg> },
  { id: "carousel", title: "Carousel Generator", description: "Turn the idea into a swipeable post", href: "/?auth=signup&returnTo=%2Fcarousels", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M3 7v10m18-10v10"/></svg> },
];

const schema = {
  "@context": "https://schema.org", "@type": "SoftwareApplication", name: "SpyReels TikTok Viral Video Finder",
  applicationCategory: "MultimediaApplication", operatingSystem: "Web Browser", url: canonical, description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free tier available" },
};

export default function TikTokViralVideoFinderPage() {
  return <div className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <MarketingHeader />
    <main>
      <section className={`${styles.shell} ${styles.hero}`}>
        <MarketingHeroEyebrow>TikTok viral video finder</MarketingHeroEyebrow>
        <h1>Find <span>viral</span> TikTok videos in your niche</h1>
        <p>Search a public TikTok creator. See which videos broke through. Turn a strong idea into a script in your voice.</p>
        <TikTokFinderExperience />
      </section>
      <section className={styles.motionStage} aria-label="See the SpyReels workflow"><div className={styles.motionFrame}><MarketingFinderMotion /></div></section>
      <MarketingPlatformStrip />
      <MarketingHowItWorksSection
        className={`${styles.shell} ${styles.howItWorksAnchor}`}
        title="Research to ready-to-film in 3 minutes"
        description="Go from a public TikTok creator to a video idea you can make your own."
        steps={HOW_IT_WORKS_STEPS}
      />
      <MarketingWorkspace title="Find a strong TikTok. Make the next one yours." tools={tools} />
      <MarketingFaq title="Questions about finding viral TikToks." description="Research public creator videos and bring a promising idea into your own script workflow." items={faqs} />
      <MarketingFinalCta title="Find your next video idea." description="Search a creator. Study what worked. Make the next script yours." label="Find viral TikToks" href="#finder" />
    </main>
    <MarketingFooter /><HomepageAuthGate /><Script src="/marketing/chrome.js" strategy="afterInteractive" />
  </div>;
}
