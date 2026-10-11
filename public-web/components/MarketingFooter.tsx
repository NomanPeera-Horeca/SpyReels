import { MarketingIconArrowRight, MarketingIconPlus } from "./MarketingIcons";
import { HOME_HREF, LOGO_MARK_SRC, SIGNUP_HREF } from "./marketingNavData";
import { marketingSharedCopy } from "../lib/marketingSharedCopy";
import styles from "./MarketingFooter.module.css";

const FOOTER_COLUMNS = [
  {
    title: marketingSharedCopy.footer.categories[0],
    links: [
      ["/features/viral-reel-finder", "Viral Reel Finder"],
      ["/free-tools/ai-script-generator", "AI Viral Script Generator"],
      ["/free-tools/viral-hooks", "Viral Hook Generator"],
      ["/free-tools/broll-generator", "B-roll Generator"],
      ["/pricing", "Pricing"],
    ],
  },
  {
    title: marketingSharedCopy.footer.categories[1],
    links: [
      ["/features/viral-reel-finder", "Reel Finder"],
      ["/free-tools/ai-script-generator", "AI Script Generator"],
      ["/free-tools/viral-hooks", "Viral Hooks"],
      ["/free-tools/broll-generator", "B-roll Generator"],
      ["/?auth=signup&returnTo=%2Fcarousels", "Carousel Generator"],
    ],
  },
  {
    title: marketingSharedCopy.footer.categories[2],
    links: [
      ["/features/viral-reel-finder", "Instagram Reels"],
      ["/free-tools/tiktok-viral-video-finder", "TikTok"],
      ["/free-tools/youtube-shorts-viral-finder", "YouTube Shorts"],
    ],
  },
  {
    title: marketingSharedCopy.footer.categories[3],
    links: [
      ["/blog", "Blog"],
      ["/#answers", "Help Center"],
      ["/contact", "Contact"],
    ],
  },
  {
    title: marketingSharedCopy.footer.categories[4],
    links: [
      ["/about", "About"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ],
  },
] as const;

/**
 * Marketing / Footer — Responsive v1.0 (Figma Page 09).
 * Dark scope + Dark Brand logo; mobile accordion keeps all links in the DOM.
 */
export function MarketingFooter() {
  return (
    <footer className={styles.footer} data-marketing-footer>
      <div className={styles.shell}>
        <div className={styles.top}>
          <div className={styles.brandBlock}>
            <a className={styles.brandLink} href={HOME_HREF} aria-label="SpyReels home">
              <img
                className={styles.logoMark}
                src={LOGO_MARK_SRC}
                alt=""
                width={36}
                height={36}
              />
              <span className={styles.logoWordmark}>SpyReels</span>
            </a>
            <h2 className={`${styles.headline} sr-text-marketing-title-medium`}>
              {marketingSharedCopy.footer.headline}
            </h2>
            <p className={`${styles.blurb} sr-text-marketing-body-small`}>
              {marketingSharedCopy.footer.support}
            </p>
            <a className={`${styles.cta} sr-text-core-button-large`} href={SIGNUP_HREF}>
              Start free
              <MarketingIconArrowRight className={styles.ctaIcon} aria-hidden="true" />
            </a>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div className={styles.col} key={col.title}>
              <h3 className={`${styles.colTitle} sr-text-marketing-eyebrow`}>{col.title}</h3>
              {col.links.map(([href, label]) => (
                <a className="sr-text-marketing-body-small" href={href} key={`${col.title}-${href}-${label}`}>
                  {label}
                </a>
              ))}
            </div>
          ))}

          <div className={styles.accordion}>
            {FOOTER_COLUMNS.map((col) => (
              <details className={styles.accordionRow} key={col.title}>
                <summary className="sr-text-marketing-label">
                  {col.title}
                  <MarketingIconPlus className={styles.accordionPlus} aria-hidden="true" />
                </summary>
                <div className={styles.accordionLinks}>
                  {col.links.map(([href, label]) => (
                    <a className="sr-text-marketing-body-small" href={href} key={`acc-${col.title}-${href}-${label}`}>
                      {label}
                    </a>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={`${styles.copyright} sr-text-marketing-caption`}>
            © 2026 SpyReels by Spyreels Inc. All rights reserved.
          </p>
          <nav className={styles.social} aria-label="SpyReels on social">
            <a
              href="https://www.instagram.com/spyreels/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SpyReels on Instagram"
            >
              <img
                className={styles.socialIcon}
                src="/marketing/platform-instagram-mono.svg"
                alt=""
                width={18}
                height={18}
              />
            </a>
            <a
              href="https://www.tiktok.com/@spyreels"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SpyReels on TikTok"
            >
              <img
                className={styles.socialIcon}
                src="/marketing/platform-tiktok-mono.svg"
                alt=""
                width={18}
                height={18}
              />
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
