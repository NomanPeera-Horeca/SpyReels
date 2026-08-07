import type { MouseEvent } from "react";
import { Link } from "wouter";
import alarmMp4 from "@/assets/broll-generator/clips/alarm.mp4";
import calendarMp4 from "@/assets/broll-generator/clips/calendar.mp4";
import journalMp4 from "@/assets/broll-generator/clips/journal.mp4";
import coffeeMp4 from "@/assets/broll-generator/clips/coffee.mp4";
import sunriseMp4 from "@/assets/broll-generator/clips/sunrise.mp4";
import { BROLL_LANDING_FAQ, BROLL_LANDING_NICHES } from "./brollLandingCopy";

const SAMPLE_CLIPS = [
  {
    src: alarmMp4,
    label: "B-roll clip: alarm clock going off at dawn, matched to the beat 'quit their morning routine'",
    caption:
      'Script says "quit their morning routine"... SpyReels generated "An alarm clock at dawn"',
  },
  {
    src: calendarMp4,
    label: "B-roll clip: calendar with pen, matched to the beat 'by day 10'",
    caption: 'Script says "by day 10"... SpyReels generated "A calendar page with pen"',
  },
  {
    src: journalMp4,
    label: "B-roll clip: hand writing in a journal, matched to the beat 'the one habit that actually stuck'",
    caption:
      'Script says "the one habit that actually stuck"... SpyReels generated "A hand writing in a journal"',
  },
  {
    src: coffeeMp4,
    label: "B-roll clip: coffee being poured in morning light, matched to the beat 'so simple'",
    caption: 'Script says "so simple"... SpyReels generated "Pour-over coffee in morning light"',
  },
  {
    src: sunriseMp4,
    label: "B-roll clip: people running outdoors at sunrise, matched to the beat 'nobody told you sooner'",
    caption: 'Script says "nobody told you sooner"... SpyReels generated "Runners at sunrise"',
  },
] as const;

export function SocialProof() {
  return (
    <section
      className="border-b border-zinc-200 bg-[#0a0a0f] py-6"
      aria-label="Product highlights"
    >
      <div className="mx-auto grid max-w-7xl gap-4 px-6 text-center sm:grid-cols-3 lg:px-8">
        <p className="font-ui text-[14px] font-medium text-zinc-300 lg:text-[15px]">
          <span className="text-violet-400">◆</span> Works with scripts or raw
          footage
        </p>
        <p className="font-ui text-[14px] font-medium text-zinc-300 lg:text-[15px]">
          <span className="text-violet-400">◆</span> Real footage + AI-generated
          B-roll
        </p>
        <p className="font-ui text-[14px] font-medium text-zinc-300 lg:text-[15px]">
          <span className="text-violet-400">◆</span> Preview free, no account
          needed
        </p>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="reveal scroll-mt-20 bg-white py-12 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="max-w-2xl font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          How the B-Roll Generator Works
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              t: "Paste your script or upload your video",
              d: "Drop in a script you've written, or upload a talking-head video you've already filmed.",
            },
            {
              t: "We find the right shots",
              d: "SpyReels reads through your content and figures out exactly where footage is needed, and what it should show.",
            },
            {
              t: "Get matched footage instantly",
              d: "Every moment gets the right clip, real footage or AI-generated, picked for what's actually being said.",
            },
            {
              t: "Download and share",
              d: "Once it's ready, download your video and post it anywhere.",
            },
          ].map((step, i) => (
            <li
              key={step.t}
              className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 font-ui text-[15px] font-bold text-violet-700">
                {i + 1}
              </span>
              <h3 className="mt-4 font-sans text-[18px] font-semibold leading-snug lg:text-[20px]">
                {step.t}
              </h3>
              <p className="mt-2 text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
                {step.d}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function InputModes() {
  return (
    <section className="reveal bg-purple-50 py-12 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-white p-6 lg:p-8">
            <p className="font-ui text-[12px] font-bold uppercase tracking-[0.05em] text-violet-700 lg:text-[13px]">
              From a Script
            </p>
            <h3 className="mt-3 font-sans text-[18px] font-semibold lg:text-[20px]">
              Start With a Script
            </h3>
            <p className="mt-2 text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
              Paste text you've already written, a voiceover, a podcast excerpt,
              a video outline, and get matched B-roll before you ever pick up a
              camera.
            </p>
            <a
              href="#demo"
              className="mt-5 inline-block font-ui text-[15px] font-bold text-violet-700 underline-offset-4 hover:underline"
            >
              See script mode →
            </a>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-6 lg:p-8">
            <p className="font-ui text-[12px] font-bold uppercase tracking-[0.05em] text-indigo-700 lg:text-[13px]">
              From a Video
            </p>
            <h3 className="mt-3 font-sans text-[18px] font-semibold lg:text-[20px]">
              Start With Footage
            </h3>
            <p className="mt-2 text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
              Upload a video you've already filmed. SpyReels transcribes it
              automatically and drops matching B-roll into the right spots on
              your existing timeline.
            </p>
            <a
              href="#demo"
              className="mt-5 inline-block font-ui text-[15px] font-bold text-indigo-700 underline-offset-4 hover:underline"
            >
              See video mode →
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}

export function WhenToUseBroll() {
  const cards = [
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

  return (
    <section className="reveal bg-white py-12 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="max-w-2xl font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          When to Use B-Roll
        </h2>
        <p className="mt-3 max-w-2xl text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
          Here's when B-roll actually makes a difference.
        </p>
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {cards.map((card) => (
            <li
              key={card.title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100"
            >
              <span className="text-[28px] leading-none" aria-hidden="true">
                {card.icon}
              </span>
              <h3 className="mt-4 font-sans text-[18px] font-semibold leading-snug lg:text-[20px]">
                {card.title}
              </h3>
              <p className="mt-2 text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
                {card.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SampleGallery() {
  return (
    <section
      id="sample-output"
      className="reveal scroll-mt-20 bg-[#0a0a0f] py-12 text-white lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          See It In Action
        </h2>
        <figure className="mt-6 max-w-3xl rounded-xl border border-white/10 bg-white/5 p-5">
          <figcaption className="font-ui text-[12px] font-bold uppercase tracking-[0.05em] text-zinc-400 lg:text-[13px]">
            Sample script
          </figcaption>
          <blockquote className="mt-2 text-[16px] leading-[1.6] text-zinc-200 lg:text-[17px]">
            "Most people quit their morning routine by day 10. Here's the one
            habit that actually stuck for me - and why it's so simple you'll
            wonder why nobody told you sooner."
          </blockquote>
        </figure>

        <div className="mt-8 mx-auto grid max-w-4xl grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
          {SAMPLE_CLIPS.map((clip) => (
            <figure key={clip.src}>
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10">
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
                  className="h-full w-full object-cover"
                />
              </div>
              <figcaption className="mt-2.5 text-[13px] leading-snug text-zinc-400 lg:text-[14px]">
                {clip.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function UseCaseGrid() {
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

    demo.classList.remove("demo-panel-pulse");
    // Restart CSS animation if the class was already present.
    void demo.offsetWidth;
    demo.classList.add("demo-panel-pulse");
    window.setTimeout(() => {
      demo.classList.remove("demo-panel-pulse");
    }, 1600);
  }

  return (
    <section className="reveal bg-white py-12 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          B-Roll for Every Kind of Video
        </h2>
        <ul className="mt-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {BROLL_LANDING_NICHES.map((item) => (
            <li key={item.label}>
              <a
                href="#demo"
                onClick={scrollToDemoAndHighlight}
                className="group flex h-full flex-col rounded-2xl border border-zinc-200 p-5 transition hover:border-violet-400 hover:bg-purple-50 lg:p-6"
              >
                <span className="font-sans text-[16px] font-semibold leading-snug lg:text-[20px]">
                  {item.label}
                </span>
                <span className="mt-auto pt-5 font-ui text-[14px] font-bold text-violet-700">
                  Explore →
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function MoreFeatures() {
  const features = [
    {
      title: "Viral Reel Finder",
      body: "Point it at any competitor or inspiration account and see their reels ranked by an outlier score against that account's own median performance, not just raw view counts. That means you're seeing what actually overperforms for that specific creator, not just whatever went viral once.",
      href: "/features/viral-reel-finder",
      linkLabel: "Explore",
    },
    {
      title: "AI Script Coach",
      body: "Paste a reel link or a rough idea and get a full script back written in your own voice, based on the hooks and structure that already work in your niche. It's not a generic AI script, it's shaped around how you actually talk.",
      href: "/features/ai-personal-brand-coach",
      linkLabel: "Explore",
    },
    {
      title: "Carousel Generator",
      body: "Turn a script, idea, or piece of research into a swipeable, styled carousel ready to post, without opening Canva or a design tool. Useful for creators who post carousels alongside Reels to cover both formats from one research session.",
      href: "/carousel-library",
      linkLabel: "Open Carousel Library",
    },
    {
      title: "Transcription",
      body: "Every reel you save or research comes with a clean, timestamped transcript automatically. Search across transcripts, pull quotes for a script, or just skip re-watching a video to remember what someone said.",
      href: "/saved",
      linkLabel: "View Saved Reels",
    },
    {
      title: "30-Day Content Planner",
      body: "Feed in your best-performing research and get back a ready-to-shoot content calendar for the month. Instead of opening SpyReels each day wondering what to post, you get a plan you can batch-film against.",
      href: "/features/30-day-content-plan",
      linkLabel: "Explore",
    },
    {
      title: "Production Notes",
      body: "Alongside every generated script, get shot-by-shot notes and sound suggestions, so you're not guessing what b-roll or audio to pair with each line on filming day.",
      href: "/scripts",
      linkLabel: "Open Scripts",
    },
    {
      title: "Hooks, Captions & Hashtags",
      body: "Pull proven opening hooks and matching hashtag sets built for your niche, ready to paste in at publish time instead of writing captions from a blank box every time.",
      href: "/free-tools/viral-hooks",
      linkLabel: "Explore Viral Hooks",
    },
    {
      title: "Remake on the Go via Telegram",
      body: "Send any reel link to SpyReels through Telegram and get a remade script sent right back, no need to open the dashboard or sit at a laptop. Built for creators who spot inspiration mid-scroll and want to act on it immediately.",
      href: "/settings",
      linkLabel: "Connect Telegram",
    },
  ] as const;

  return (
    <section className="reveal bg-purple-50 py-12 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="max-w-2xl font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          More Than B-Roll
        </h2>
        <p className="mt-3 max-w-3xl text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
          Finding the right clip to match your script is only one part of putting
          out consistent Reels. Most creators juggle five or six different tools
          to go from an idea to a published post: one for research, one for
          scripting, one for captions, one for scheduling. SpyReels was built to
          close those gaps in one workspace, so b-roll is often just the first
          thing people try before they find the rest.
        </p>
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-2">
          {features.map((feature) => (
            <li
              key={feature.title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100"
            >
              <h3 className="font-sans text-[18px] font-semibold leading-snug lg:text-[20px]">
                {feature.title}
              </h3>
              <p className="mt-2 text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
                {feature.body}
              </p>
              <Link
                href={feature.href}
                className="mt-5 inline-block font-ui text-[14px] font-bold text-violet-700 underline-offset-4 hover:underline"
              >
                {feature.linkLabel} →
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-3xl text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
          Most people come to SpyReels for one feature and end up using three or
          four without meaning to, because the research, scripting, and planning
          all pull from the same data instead of starting over each time. Start
          with b-roll if that's what brought you here, and pull in the rest
          whenever your workflow needs it.
        </p>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="reveal scroll-mt-20 bg-white py-12 lg:py-24">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <h2 className="font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          Frequently Asked Questions
        </h2>
        <div className="mt-8 flex flex-col gap-4">
          {BROLL_LANDING_FAQ.map((item) => (
            <details
              key={item.q}
              className="faq group rounded-xl border border-zinc-200 p-5 open:border-violet-300 open:bg-purple-50/40"
            >
              <summary className="flex cursor-pointer items-start justify-between gap-4 font-sans text-[17px] font-semibold text-zinc-900 marker:content-none lg:text-[18px]">
                {item.q}
                <span className="faq-icon mt-1 shrink-0 text-violet-600" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[16px] leading-[1.6] text-zinc-600 lg:text-[17px]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="reveal relative overflow-hidden bg-[#0a0a0f] py-14 text-white lg:py-24">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-violet-600/30 blur-[130px]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      <div className="relative mx-auto max-w-3xl px-6 text-center lg:px-8">
        <h2 className="font-display text-[26px] font-bold leading-[1.2] tracking-[-0.015em] lg:text-[40px] lg:leading-[1.1]">
          Your Next Video Doesn't Need More Footage. It Needs the Right Footage.
        </h2>
        <a
          href="#demo"
          className="mt-8 inline-block rounded-full bg-violet-600 px-8 py-4 font-ui text-[15px] font-bold text-white shadow-lg shadow-violet-900/50 transition hover:bg-violet-500"
        >
          Try the Free B-Roll Generator
        </a>
        <p className="mt-4 font-ui text-[13px] font-medium text-zinc-400">
          No credit card. No login. Preview in under 30 seconds.
        </p>
      </div>
    </section>
  );
}
