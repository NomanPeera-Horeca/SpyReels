import styles from "./PublicSiteChrome.module.css";

const APP_ORIGIN = "https://spyreels.ai";
const LOGO_URL = `${APP_ORIGIN}/brand/spyreels-logo.png`;

const COLUMNS = [
  [
    "Company",
    [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Affiliate", "/affiliate"],
    ],
  ],
  [
    "Product",
    [
      ["Viral Reel Finder", "/features/viral-reel-finder"],
      ["30-Day Content Plan", "/features/30-day-content-plan"],
      ["AI Personal Brand Coach", "/features/ai-personal-brand-coach"],
      ["Pricing", "/pricing"],
      ["How It Works", "/#how-it-works"],
      ["Extension", "/extension"],
    ],
  ],
  [
    "Free Tools",
    [
      ["All Free Tools", "/free-tools"],
      ["Viral Hooks", "/free-tools/viral-hooks"],
      ["AI Script Generator", "/free-tools/ai-script-generator"],
      ["TikTok Script Generator", "/free-tools/tiktok-script-generator"],
      ["Instagram Reels Script Generator", "/free-tools/instagram-reels-script-generator"],
      ["Instagram Transcript Generator", "/free-tools/instagram-transcript-generator"],
      ["TikTok Transcript Generator", "/free-tools/tiktok-transcript-generator"],
      ["YouTube Shorts Transcript", "/free-tools/youtube-shorts-transcript"],
      ["YouTube Transcript Generator", "/free-tools/youtube-transcript-generator"],
      ["B-Roll Generator", "/free-tools/broll-generator"],
      ["TikTok Viral Video Finder", "/free-tools/tiktok-viral-video-finder"],
      ["YouTube Shorts Viral Finder", "/free-tools/youtube-shorts-viral-finder"],
    ],
  ],
  [
    "Resources",
    [
      ["Blog", "/blog"],
      ["FAQ", "/#faq"],
    ],
  ],
  [
    "Legal",
    [
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
    ],
  ],
] as const;

export function PublicSiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrandBlock}>
            <a className={styles.footerBrand} href={`${APP_ORIGIN}/`}>
              <img className={styles.logo} src={LOGO_URL} alt="SpyReels" width={28} height={28} />
              <span>SpyReels</span>
            </a>
            <p className={styles.footerCopy}>
              Research what&apos;s working, plan a month of content, and script Reels in your own voice, all in one place built for creators who want to grow faster.
            </p>
          </div>

          {COLUMNS.map(([title, links]) => (
            <div className={styles.footerColumn} key={title}>
              <h3>{title}</h3>
              {links.map(([label, path]) => (
                <a href={`${APP_ORIGIN}${path}`} key={path}>{label}</a>
              ))}
            </div>
          ))}
        </div>
        <div className={styles.copyright}>© {new Date().getFullYear()} SpyReels. All rights reserved.</div>
      </div>
    </footer>
  );
}
