"use client";

import { useEffect, useRef } from "react";
import { MarketingSection } from "./MarketingSection";
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

/** Continuous rail speed restored from pre-React homepage.js glideStories. */
const STORIES_SCROLL_PX_PER_MS = 0.052;
const STORIES_TOUCH_RESUME_MS = 3500;

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

function StoryCard({ story, duplicate }: { story: CreatorStory; duplicate?: boolean }) {
  return (
    <article
      className={styles.card}
      aria-hidden={duplicate ? true : undefined}
      {...(duplicate ? { inert: true } : {})}
    >
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
  );
}

/**
 * Marketing / Creator Stories (Figma Page 09).
 * Large/Center header; auto-scrolling rail (seamless loop) with hover/touch pause.
 */
export function MarketingCreatorStories() {
  const titleId = "stories-title";
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storiesRail = railRef.current;
    if (!storiesRail) return;

    const storyCount = STORIES.length;
    const storyMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let storiesPaused = false;
    let storiesVisible = true;
    let storiesResumeAt = 0;
    let storiesLastTime = 0;
    let rafId = 0;

    const storiesLoopWidth = () => {
      const first = storiesRail.children[0] as HTMLElement | undefined;
      const loopStart = storiesRail.children[storyCount] as HTMLElement | undefined;
      if (!first || !loopStart) return 0;
      return loopStart.offsetLeft - first.offsetLeft;
    };

    const normalizeStories = () => {
      const width = storiesLoopWidth();
      if (width && storiesRail.scrollLeft >= width) {
        storiesRail.scrollLeft -= width;
      }
    };

    const glideStories = (now: number) => {
      if (!storiesLastTime) storiesLastTime = now;
      const elapsed = Math.min(now - storiesLastTime, 100);
      storiesLastTime = now;
      if (
        !storyMotion.matches &&
        storiesVisible &&
        !storiesPaused &&
        now > storiesResumeAt
      ) {
        storiesRail.scrollLeft += elapsed * STORIES_SCROLL_PX_PER_MS;
        normalizeStories();
      }
      rafId = requestAnimationFrame(glideStories);
    };

    const onMouseEnter = () => {
      storiesPaused = true;
    };
    const onMouseLeave = () => {
      storiesPaused = false;
      storiesResumeAt = 0;
    };
    const onFocusIn = () => {
      storiesPaused = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!storiesRail.contains(event.relatedTarget as Node | null)) {
        storiesPaused = false;
        storiesResumeAt = 0;
      }
    };
    const pauseAfterTouch = () => {
      storiesResumeAt = performance.now() + STORIES_TOUCH_RESUME_MS;
    };

    storiesRail.addEventListener("mouseenter", onMouseEnter);
    storiesRail.addEventListener("mouseleave", onMouseLeave);
    storiesRail.addEventListener("focusin", onFocusIn);
    storiesRail.addEventListener("focusout", onFocusOut);
    storiesRail.addEventListener("pointerdown", pauseAfterTouch);
    storiesRail.addEventListener("touchstart", pauseAfterTouch, { passive: true });

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        storiesVisible = Boolean(entries[0]?.isIntersecting);
      },
      { threshold: 0 },
    );
    visibilityObserver.observe(storiesRail);

    rafId = requestAnimationFrame(glideStories);

    return () => {
      cancelAnimationFrame(rafId);
      visibilityObserver.disconnect();
      storiesRail.removeEventListener("mouseenter", onMouseEnter);
      storiesRail.removeEventListener("mouseleave", onMouseLeave);
      storiesRail.removeEventListener("focusin", onFocusIn);
      storiesRail.removeEventListener("focusout", onFocusOut);
      storiesRail.removeEventListener("pointerdown", pauseAfterTouch);
      storiesRail.removeEventListener("touchstart", pauseAfterTouch);
    };
  }, []);

  return (
    <MarketingSection
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
            ref={railRef}
            className={styles.rail}
            id="stories-rail"
            role="region"
            aria-label="Illustrative creator stories"
            tabIndex={0}
          >
            {STORIES.map((story) => (
              <StoryCard key={story.name} story={story} />
            ))}
            {STORIES.map((story) => (
              <StoryCard key={`dup-${story.name}`} story={story} duplicate />
            ))}
          </div>
          <div className={styles.fadeLeft} aria-hidden="true" />
          <div className={styles.fadeRight} aria-hidden="true" />
        </div>
      </div>
    </MarketingSection>
  );
}
