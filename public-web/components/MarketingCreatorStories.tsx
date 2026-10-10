import { MarketingSectionHeader } from "./MarketingSectionHeader";
import { MarketingIconStar } from "./MarketingIcons";
import styles from "./MarketingCreatorStories.module.css";

type CreatorStory = {
  quote: string;
  name: string;
  meta: string;
  avatarSrc: string;
};

const STORIES: readonly CreatorStory[] = [
  {
    quote:
      "\u201cI used to spend 3 hours a day scrolling trying to find what was trending. Now I open SpyReels, pick a viral outlier, and ship by lunch.\u201d",
    name: "Maya Chen",
    meta: "@mayamakes",
    avatarSrc: "/marketing/17d74cf5b9b4.webp",
  },
  {
    quote:
      "\u201cHonestly skeptical at first. Two weeks in I remade a Reel that booked a brand deal. Paid for itself many times over.\u201d",
    name: "Priya Sharma",
    meta: "@priyacooks",
    avatarSrc: "/marketing/f4f2be43966c.webp",
  },
  {
    quote:
      "\u201cPitched a client using spy + remake insights. Closed a retainer the next week. The data tells a story execs actually care about.\u201d",
    name: "Rafael Mendes",
    meta: "Senior Strategist, Pivot Co.",
    avatarSrc: "/marketing/ceff676b111f.webp",
  },
  {
    quote:
      "\u201cOur team finally stopped pitching vague trend decks. We walk in with examples, transcripts, and proof of traction.\u201d",
    name: "Jordan Reyes",
    meta: "Head of Social, Northline",
    avatarSrc: "/marketing/3e709ab99b48.webp",
  },
  {
    quote:
      "\u201cThe hook breakdowns alone changed how I script. I stopped rambling in the first five seconds.\u201d",
    name: "Nina Flores",
    meta: "@ninacuts",
    avatarSrc: "/marketing/e1740faf9a91.webp",
  },
  {
    quote:
      "\u201cI used to save random videos and forget why they worked. Now every example comes with a reason I can apply on camera.\u201d",
    name: "Sofia Lane",
    meta: "@sofiamoves",
    avatarSrc: "/marketing/10be69f1cbcb.webp",
  },
];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function RatingStars() {
  return (
    <div className={styles.rating} aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }, (_, index) => (
        <MarketingIconStar key={index} />
      ))}
    </div>
  );
}

/**
 * Marketing / Creator Stories (Figma Page 09).
 * Large/Center header (no highlight); six-card keyboard-accessible rail.
 */
export function MarketingCreatorStories() {
  const titleId = "stories-title";

  return (
    <section
      className={styles.section}
      id="creator-stories"
      aria-labelledby={titleId}
      data-marketing-creator-stories=""
    >
      <div className={styles.shell}>
        <MarketingSectionHeader
          className={styles.header}
          title="Real creators. Real results."
          subtitle="Creators in every niche are using SpyReels to study what works and grow faster."
          headingLevel="h2"
          titleId={titleId}
          size="large"
          align="center"
        />

        <div className={styles.viewport}>
          <div
            className={styles.rail}
            id="stories-rail"
            role="region"
            aria-label="Illustrative creator stories"
            tabIndex={0}
          >
            {STORIES.map((story) => (
              <article key={story.name} className={styles.card}>
                <RatingStars />
                <blockquote className={cx("sr-text-marketing-body-large", styles.quote)}>
                  {story.quote}
                </blockquote>
                <div className={styles.spacer} aria-hidden="true" />
                <div className={styles.person}>
                  <span className={styles.avatar} aria-hidden="true">
                    <img src={story.avatarSrc} alt="" loading="lazy" width={44} height={44} />
                  </span>
                  <div className={styles.identity}>
                    <strong className={cx("sr-text-marketing-label", styles.name)}>{story.name}</strong>
                    <small className={cx("sr-text-marketing-caption", styles.meta)}>{story.meta}</small>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.fadeLeft} aria-hidden="true" />
          <div className={styles.fadeRight} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
