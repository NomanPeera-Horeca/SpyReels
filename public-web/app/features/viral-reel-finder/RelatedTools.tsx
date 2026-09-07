import styles from "./RelatedTools.module.css";

const SITE_URL = "https://spyreels.ai";

const TOOLS = [
  {
    href: "/free-tools/tiktok-viral-video-finder",
    title: "TikTok Viral Video Finder",
  },
  {
    href: "/free-tools/instagram-reels-script-generator",
    title: "Instagram Reels Script Generator",
  },
  {
    href: "/free-tools/viral-hooks",
    title: "Viral Hook Generator",
  },
] as const;

export function RelatedTools() {
  return (
    <section className={styles.section} aria-labelledby="related-tools-heading">
      <div className={styles.headingRow}>
        <span className={styles.eyebrow}>Explore more tools</span>
        <h2 id="related-tools-heading">Other SpyReels tools</h2>
      </div>
      <nav className={styles.links} aria-label="More SpyReels tools">
        {TOOLS.map((tool) => (
          <a href={`${SITE_URL}${tool.href}`} key={tool.href}>
            {tool.title}
          </a>
        ))}
      </nav>
    </section>
  );
}
