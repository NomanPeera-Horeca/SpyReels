"use client";

import type { MouseEvent } from "react";
import { MarketingCard } from "../../../components/MarketingCard";
import { MarketingSection } from "../../../components/MarketingSection";
import { MarketingSectionHeader } from "../../../components/MarketingSectionHeader";
import {
  MarketingIconArrowRight,
  MarketingIconCheck,
  MarketingToolIcon,
} from "../../../components/MarketingIcons";
import { wrapHyphenatedCompounds } from "../../../components/marketingNoBreak";
import {
  BROLL_LANDING_NICHES,
  BROLL_LANDING_SAMPLE_SCRIPT,
} from "../../../lib/brollLandingCopy";
import toolGridStyles from "../../../components/MarketingToolGrid.module.css";
import styles from "./BrollGenerator.module.css";

/** Same four tools as the client RelatedToolsGrid on this page. */
const BROLL_RELATED_TOOLS = [
  {
    id: "finder",
    title: "Instagram Viral Reel Finder",
    href: "/features/viral-reel-finder",
    icon: "finder" as const,
    description: "Spot the Reels worth studying.",
  },
  {
    id: "tiktok",
    title: "TikTok Viral Video Finder",
    href: "/free-tools/tiktok-viral-video-finder",
    icon: "finder" as const,
    description: "Find more ideas on TikTok.",
  },
  {
    id: "youtube",
    title: "YouTube Shorts Viral Finder",
    href: "/free-tools/youtube-shorts-viral-finder",
    icon: "finder" as const,
    description: "Find more ideas on YouTube Shorts.",
  },
  {
    id: "script",
    title: "AI Script Generator",
    href: "/features/ai-personal-brand-coach",
    icon: "script" as const,
    description: "Turn a strong idea into a script in your voice.",
  },
] as const;

const SAMPLE_CLIPS = [
  {
    src: "/marketing/broll-generator/clips/alarm.mp4",
    label:
      "B-roll clip: alarm clock going off at dawn, matched to the beat 'quit their morning routine'",
    caption:
      'Script says "quit their morning routine"... SpyReels generated "An alarm clock at dawn"',
  },
  {
    src: "/marketing/broll-generator/clips/calendar.mp4",
    label: "B-roll clip: calendar with pen, matched to the beat 'by day 10'",
    caption: 'Script says "by day 10"... SpyReels generated "A calendar page with pen"',
  },
  {
    src: "/marketing/broll-generator/clips/journal.mp4",
    label:
      "B-roll clip: hand writing in a journal, matched to the beat 'the one habit that actually stuck'",
    caption:
      'Script says "the one habit that actually stuck"... SpyReels generated "A hand writing in a journal"',
  },
  {
    src: "/marketing/broll-generator/clips/coffee.mp4",
    label:
      "B-roll clip: coffee being poured in morning light, matched to the beat 'so simple'",
    caption: 'Script says "so simple"... SpyReels generated "Pour-over coffee in morning light"',
  },
  {
    src: "/marketing/broll-generator/clips/sunrise.mp4",
    label:
      "B-roll clip: people running outdoors at sunrise, matched to the beat 'nobody told you sooner'",
    caption: 'Script says "nobody told you sooner"... SpyReels generated "Runners at sunrise"',
  },
] as const;

const WHEN_CARDS = [
  {
    icon: "🎙️",
    title: "Smoothing out cuts between takes",
    body: "When you're editing talking-head footage, hard cuts can feel jarring. B-roll works like a visual bridge, covering the jump while keeping the viewer locked in.",
  },
  {
    icon: "👥",
    title: "Bringing your script to life",
    body: "Adding B-roll under narration makes the story land. Whether it's a shot of a city, a product close-up, or a moment being described, extra footage helps viewers see what they're hearing.",
  },
  {
    icon: "▶️",
    title: "Setting the scene",
    body: "Establishing shots are a classic move, used to orient the viewer before the main action starts. A quick wide shot or a relevant cutaway sets the tone right away.",
  },
  {
    icon: "🚀",
    title: "Enhancing Reels and Shorts",
    body: "Attention spans on short-form are unforgiving. Switching visuals every few seconds keeps content feeling dynamic instead of static.",
  },
  {
    icon: "💼",
    title: "Playing with camera angles",
    body: "Overheads, close-ups, slow pans, creative angles turn a flat recording into something that feels shot with intention, not just a phone propped on a desk.",
  },
  {
    icon: "📋",
    title: "Planning ahead",
    body: "Mapping out your B-roll before you film gives your story structure from the start, filling gaps and covering weak moments before they happen.",
  },
] as const;

const MORE_FEATURES = [
  {
    title: "Viral Reel Finder",
    body: "Point it at any competitor or inspiration account and see their reels ranked by an outlier score against that account's own median performance, not just raw view counts. That means you're seeing what actually overperforms for that specific creator, not just whatever went viral once.",
    href: "/features/viral-reel-finder",
    linkLabel: "Explore",
    icon: "finder" as const,
  },
  {
    title: "AI Script Coach",
    body: "Paste a reel link or a rough idea and get a full script back written in your own voice, based on the hooks and structure that already work in your niche. It's not a generic AI script, it's shaped around how you actually talk.",
    href: "/features/ai-personal-brand-coach",
    linkLabel: "Explore",
    icon: "script" as const,
  },
  {
    title: "Carousel Generator",
    body: "Turn a script, idea, or piece of research into a swipeable, styled carousel ready to post, without opening Canva or a design tool. Useful for creators who post carousels alongside Reels to cover both formats from one research session.",
    href: "/carousel-library",
    linkLabel: "Open Carousel Library",
    icon: "carousel" as const,
  },
  {
    title: "Transcription",
    body: "Every reel you save or research comes with a clean, timestamped transcript automatically. Search across transcripts, pull quotes for a script, or just skip re-watching a video to remember what someone said.",
    href: "/saved",
    linkLabel: "View Saved Reels",
    icon: null,
  },
  {
    title: "30-Day Content Planner",
    body: "Feed in your best-performing research and get back a ready-to-shoot content calendar for the month. Instead of opening SpyReels each day wondering what to post, you get a plan you can batch-film against.",
    href: "/features/30-day-content-plan",
    linkLabel: "Explore",
    icon: null,
  },
  {
    title: "Production Notes",
    body: "Alongside every generated script, get shot-by-shot notes and sound suggestions, so you're not guessing what b-roll or audio to pair with each line on filming day.",
    href: "/scripts",
    linkLabel: "Open Scripts",
    icon: "script" as const,
  },
  {
    title: "Hooks, Captions & Hashtags",
    body: "Pull proven opening hooks and matching hashtag sets built for your niche, ready to paste in at publish time instead of writing captions from a blank box every time.",
    href: "/free-tools/viral-hooks",
    linkLabel: "Explore Viral Hooks",
    icon: "hooks" as const,
  },
  {
    title: "Remake on the Go via Telegram",
    body: "Send any reel link to SpyReels through Telegram and get a remade script sent right back, no need to open the dashboard or sit at a laptop. Built for creators who spot inspiration mid-scroll and want to act on it immediately.",
    href: "/settings",
    linkLabel: "Connect Telegram",
    icon: null,
  },
] as const;

export function BrollSocialProof() {
  const items = [
    "Works with scripts or raw footage",
    "Real footage + AI-generated B-roll",
    "Preview free, no account needed",
  ] as const;

  return (
    <MarketingSection
      pair="start"
      className={styles.proofBand}
      aria-label="Product highlights"
    >
      <div className={`shell ${styles.proofGrid}`}>
        {items.map((text) => (
          <p key={text} className={`sr-text-marketing-body-small ${styles.proofItem}`}>
            <MarketingIconCheck className={styles.proofIcon} aria-hidden="true" />
            {wrapHyphenatedCompounds(text)}
          </p>
        ))}
      </div>
    </MarketingSection>
  );
}

export function BrollInputModes() {
  return (
    <MarketingSection pair="start" className="shell">
      <div className={styles.inputModesGrid}>
        <MarketingCard as="article">
          <p className={`sr-text-marketing-eyebrow ${styles.cardEyebrowBrand}`}>From a Script</p>
          <h3 className="sr-text-marketing-title-medium">
            {wrapHyphenatedCompounds("Start With a Script")}
          </h3>
          <p className="sr-text-marketing-body-medium">
            {wrapHyphenatedCompounds(
              "Paste text you've already written, a voiceover, a podcast excerpt, a video outline, and get matched B-roll before you ever pick up a camera."
            )}
          </p>
          <a href="#demo" className={`sr-text-core-button-large ${styles.cardLink}`}>
            See script mode →
          </a>
        </MarketingCard>
        <MarketingCard as="article">
          <p className={`sr-text-marketing-eyebrow ${styles.cardEyebrowIndigo}`}>From a Video</p>
          <h3 className="sr-text-marketing-title-medium">
            {wrapHyphenatedCompounds("Start With Footage")}
          </h3>
          <p className="sr-text-marketing-body-medium">
            {wrapHyphenatedCompounds(
              "Upload a video you've already filmed. SpyReels transcribes it automatically and drops matching B-roll into the right spots on your existing timeline."
            )}
          </p>
          <a
            href="#demo"
            className={`sr-text-core-button-large ${styles.cardLink} ${styles.cardLinkIndigo}`}
          >
            See video mode →
          </a>
        </MarketingCard>
      </div>
    </MarketingSection>
  );
}

export function BrollWhenToUse() {
  return (
    <MarketingSection pair="end" className="shell">
      <MarketingSectionHeader
        title="When to Use B-Roll"
        subtitle="Here's when B-roll actually makes a difference."
        headingLevel="h2"
        size="large"
        align="start"
      />
      <ul className={styles.whenGrid}>
        {WHEN_CARDS.map((card) => (
          <li key={card.title}>
            <MarketingCard as="article">
              <span className={styles.emojiIcon} aria-hidden="true">
                {card.icon}
              </span>
              <h3 className="sr-text-marketing-title-medium">
                {wrapHyphenatedCompounds(card.title)}
              </h3>
              <p className="sr-text-marketing-body-medium">
                {wrapHyphenatedCompounds(card.body)}
              </p>
            </MarketingCard>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

export function BrollSampleGallery() {
  return (
    <MarketingSection
      id="sample-output"
      pair="start"
      className={`shell ${styles.gallerySection}`}
    >
      <MarketingSectionHeader
        title="See It In Action"
        headingLevel="h2"
        size="large"
        align="start"
      />
      <figure className={styles.sampleScript}>
        <figcaption className={`sr-text-marketing-eyebrow ${styles.sampleScriptLabel}`}>
          Sample script
        </figcaption>
        <blockquote className={`sr-text-marketing-body-medium ${styles.sampleScriptQuote}`}>
          &quot;{wrapHyphenatedCompounds(BROLL_LANDING_SAMPLE_SCRIPT)}&quot;
        </blockquote>
      </figure>
      <ul className={styles.clipGrid}>
        {SAMPLE_CLIPS.map((clip) => (
          <li key={clip.src}>
            <figure>
              <div className={styles.clipFrame}>
                <video
                  src={clip.src}
                  aria-label={clip.label}
                  width={360}
                  height={640}
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="metadata"
                />
              </div>
              <figcaption className={`sr-text-marketing-body-medium ${styles.clipCaption}`}>
                {wrapHyphenatedCompounds(clip.caption)}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

export function BrollUseCaseGrid() {
  function scrollToDemoAndHighlight(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const demo = document.getElementById("demo");
    if (!demo) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    demo.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });

    demo.classList.remove(styles.demoPanelPulse);
    void demo.offsetWidth;
    demo.classList.add(styles.demoPanelPulse);
    window.setTimeout(() => {
      demo.classList.remove(styles.demoPanelPulse);
    }, 1600);
  }

  return (
    <MarketingSection pair="end" className="shell">
      <MarketingSectionHeader
        title="B-Roll for Every Kind of Video"
        headingLevel="h2"
        size="large"
        align="start"
      />
      <ul className={styles.nicheGrid}>
        {BROLL_LANDING_NICHES.map((item) => (
          <li key={item.label}>
            <a
              href="#demo"
              onClick={scrollToDemoAndHighlight}
              className={styles.nicheCard}
            >
              <span className="sr-text-marketing-title-medium">
                {wrapHyphenatedCompounds(item.label)}
              </span>
              <span className={`sr-text-marketing-button ${styles.nicheExplore}`}>
                Explore →
              </span>
            </a>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

export function BrollMoreFeatures() {
  return (
    <MarketingSection pair="start" className="shell">
      <MarketingSectionHeader
        title="More Than B-Roll"
        subtitle="Finding the right clip to match your script is only one part of putting out consistent Reels. Most creators juggle five or six different tools to go from an idea to a published post: one for research, one for scripting, one for captions, one for scheduling. SpyReels was built to close those gaps in one workspace, so b-roll is often just the first thing people try before they find the rest."
        headingLevel="h2"
        size="large"
        align="start"
      />
      <ul className={styles.moreGrid}>
        {MORE_FEATURES.map((feature) => (
          <li key={feature.title}>
            <MarketingCard as="article">
              {feature.icon ? (
                <div className={styles.moreCardHeader}>
                  <span className={styles.moreIcon} aria-hidden="true">
                    <MarketingToolIcon name={feature.icon} />
                  </span>
                  <h3 className="sr-text-marketing-title-medium">
                    {wrapHyphenatedCompounds(feature.title)}
                  </h3>
                </div>
              ) : (
                <h3 className="sr-text-marketing-title-medium">
                  {wrapHyphenatedCompounds(feature.title)}
                </h3>
              )}
              <p className="sr-text-marketing-body-medium">
                {wrapHyphenatedCompounds(feature.body)}
              </p>
              <a href={feature.href} className={`sr-text-marketing-button ${styles.moreLink}`}>
                {feature.linkLabel} →
              </a>
            </MarketingCard>
          </li>
        ))}
      </ul>
      <p className={`sr-text-marketing-body-medium ${styles.moreClosing}`}>
        {wrapHyphenatedCompounds(
          "Most people come to SpyReels for one feature and end up using three or four without meaning to, because the research, scripting, and planning all pull from the same data instead of starting over each time. Start with b-roll if that's what brought you here, and pull in the rest whenever your workflow needs it."
        )}
      </p>
    </MarketingSection>
  );
}

/** Tool Grid cards only (no Beyond the workspace). Same tools as the old page. */
export function BrollRelatedTools() {
  return (
    <MarketingSection
      pair="end"
      aria-labelledby="broll-related-tools-title"
      data-marketing-tool-grid=""
    >
      <div className={`shell ${toolGridStyles.root}`}>
        <MarketingSectionHeader
          title="Related tools"
          subtitle="Cross-platform research and the tools that turn winners into videos."
          headingLevel="h2"
          titleId="broll-related-tools-title"
          size="large"
          align="start"
        />
        <div className={toolGridStyles.tools}>
          {BROLL_RELATED_TOOLS.map((tool) => (
            <a
              className={toolGridStyles.tool}
              id={`tool-${tool.id}`}
              href={tool.href}
              key={tool.id}
            >
              <span className={toolGridStyles.iconTile} aria-hidden="true">
                <MarketingToolIcon name={tool.icon} />
              </span>
              <span className={toolGridStyles.copy}>
                <strong className={`${toolGridStyles.title} sr-text-product-card-title`}>
                  {wrapHyphenatedCompounds(tool.title)}
                </strong>
                <small
                  className={`${toolGridStyles.description} sr-text-marketing-body-small`}
                >
                  {wrapHyphenatedCompounds(tool.description)}
                </small>
              </span>
              <span className={toolGridStyles.arrow} aria-hidden="true">
                <MarketingIconArrowRight />
              </span>
            </a>
          ))}
        </div>
      </div>
    </MarketingSection>
  );
}
