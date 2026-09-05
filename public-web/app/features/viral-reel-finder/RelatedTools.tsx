import styles from "./RelatedTools.module.css";

const SITE_URL = "https://spyreels.ai";

const TOOLS = [
  {
    href: "/free-tools/tiktok-viral-video-finder",
    eyebrow: "Research",
    title: "TikTok Viral Video Finder",
    description: "Find a creator's strongest TikToks and study what is already working.",
    visual: "finder",
  },
  {
    href: "/free-tools/instagram-reels-script-generator",
    eyebrow: "Create",
    title: "Instagram Reels Script Generator",
    description: "Turn an idea or proven content direction into a Reel script you can film.",
    visual: "script",
  },
  {
    href: "/free-tools/viral-hooks",
    eyebrow: "Ideate",
    title: "Viral Hook Generator",
    description: "Explore stronger opening lines before you commit to the full script.",
    visual: "hooks",
  },
] as const;

function ToolVisual({ type }: { type: (typeof TOOLS)[number]["visual"] }) {
  if (type === "finder") {
    return (
      <div className={styles.mockFinder} aria-hidden="true">
        <div className={styles.mockTitle}>Find a creator&apos;s strongest videos</div>
        <div className={styles.mockInput}><span>@username</span><b>Find</b></div>
        <div className={styles.mockTiles}><i /><i /><i /></div>
      </div>
    );
  }

  if (type === "script") {
    return (
      <div className={styles.mockScript} aria-hidden="true">
        <span>Hook</span>
        <strong>Start with a sharper first line.</strong>
        <div /><div /><div className={styles.shortLine} />
      </div>
    );
  }

  return (
    <div className={styles.mockHooks} aria-hidden="true">
      <div className={styles.mockHookHeading}>Create better hooks</div>
      <p>1. The mistake almost everyone makes…</p>
      <p>2. Before you do this, watch this…</p>
      <p>3. Here&apos;s what changed everything…</p>
    </div>
  );
}

export function RelatedTools() {
  return (
    <section className={styles.section} aria-labelledby="related-tools-heading">
      <div className={styles.headingRow}>
        <div>
          <span className={styles.eyebrow}>Explore SpyReels</span>
          <h2 id="related-tools-heading">Keep going after you find the winning Reel.</h2>
        </div>
        <p>Move from research into the next useful step without hunting around the product.</p>
      </div>

      <div className={styles.grid}>
        {TOOLS.map((tool) => (
          <a className={styles.card} href={`${SITE_URL}${tool.href}`} key={tool.href}>
            <div className={styles.visual}><ToolVisual type={tool.visual} /></div>
            <div className={styles.copy}>
              <span>{tool.eyebrow}</span>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              <b>Open tool →</b>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
