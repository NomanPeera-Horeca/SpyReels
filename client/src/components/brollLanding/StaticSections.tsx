import alarmJpg from "@/assets/broll-generator/clips/alarm.jpg";
import calendarJpg from "@/assets/broll-generator/clips/calendar.jpg";
import journalJpg from "@/assets/broll-generator/clips/journal.jpg";
import coffeeJpg from "@/assets/broll-generator/clips/coffee.jpg";
import sunriseJpg from "@/assets/broll-generator/clips/sunrise.jpg";
import { BROLL_LANDING_FAQ, BROLL_LANDING_NICHES } from "./brollLandingCopy";

const SAMPLE_CLIPS = [
  {
    src: alarmJpg,
    alt: "B-roll clip: alarm clock going off at dawn, matched to the beat 'quit their morning routine'",
    caption:
      'Beat: "quit their morning routine" → Clip: alarm clock at dawn, Pexels',
  },
  {
    src: calendarJpg,
    alt: "B-roll clip: calendar with pen, matched to the beat 'by day 10'",
    caption: 'Beat: "by day 10" → Clip: calendar page with pen, Pexels',
  },
  {
    src: journalJpg,
    alt: "B-roll clip: hand writing in a journal, matched to the beat 'the one habit that actually stuck'",
    caption:
      'Beat: "the one habit that actually stuck" → Clip: hand writing in a journal, Pexels',
  },
  {
    src: coffeeJpg,
    alt: "B-roll clip: coffee being poured in morning light, matched to the beat 'so simple'",
    caption:
      'Beat: "so simple" → Clip: pour-over coffee in morning light, Pexels',
  },
  {
    src: sunriseJpg,
    alt: "B-roll clip: people running outdoors at sunrise, matched to the beat 'nobody told you sooner'",
    caption: 'Beat: "nobody told you sooner" → Clip: runners at sunrise, Pexels',
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

export function WhyBroll() {
  return (
    <section className="reveal bg-white py-12 lg:py-24">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <h2 className="font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          Why B-Roll Matters
        </h2>
        <p className="mt-6 text-[17px] leading-[1.7] text-zinc-700 lg:text-[19px]">
          Static talking-head shots lose viewer attention within 8 to 10 seconds.
          B-roll resets the visual every few seconds so the voiceover keeps
          carrying the story instead of the viewer's eyes wandering.{" "}
          <strong className="font-semibold text-zinc-900">
            A B-roll generator reads a script or transcript, matches it to
            relevant stock or AI-generated video clips, and inserts them into the
            timeline automatically - turning a flat talking-head recording into a
            visually dynamic edit without manual clip-hunting.
          </strong>
        </p>
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

        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
          {SAMPLE_CLIPS.map((clip) => (
            <figure key={clip.src}>
              <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
                <img
                  src={clip.src}
                  alt={clip.alt}
                  width={800}
                  height={500}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-ui text-[10px] font-bold uppercase tracking-wide text-white">
                  Pexels
                </span>
              </div>
              <figcaption className="mt-2.5 text-[13px] leading-snug text-zinc-400 lg:text-[14px]">
                {clip.caption}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-6 font-ui text-[13px] font-medium text-zinc-500">
          Example output rendered in the page HTML - identical for logged-out
          visitors and crawlers. Footage via Pexels.
        </p>
      </div>
    </section>
  );
}

export function UseCaseGrid() {
  return (
    <section className="reveal bg-white py-12 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          B-Roll for Every Kind of Video
        </h2>
        <ul className="mt-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {BROLL_LANDING_NICHES.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                rel="nofollow"
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

export function ComparisonTable() {
  return (
    <section
      id="comparison"
      className="reveal scroll-mt-20 bg-purple-50 py-12 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] lg:text-[36px] lg:leading-[1.15]">
          SpyReels vs. Other B-Roll Tools
        </h2>
        <p className="mt-3 font-ui text-[13px] font-medium text-zinc-500 lg:hidden">
          Swipe the table sideways to compare →
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-[15px]">
            <caption className="sr-only">
              Feature comparison of SpyReels, Kapwing, Opus Clip, Captions and
              Rewind.ai B-roll tools
            </caption>
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th
                  scope="col"
                  className="sticky left-0 z-10 border-r border-zinc-200 bg-zinc-50 p-4 font-ui text-[13px] font-bold uppercase tracking-[0.05em] text-zinc-500"
                >
                  Feature
                </th>
                <th className="p-4 font-ui text-[15px] font-bold text-violet-700">
                  SpyReels
                </th>
                <th className="p-4 font-ui text-[15px] font-bold text-zinc-700">
                  Kapwing
                </th>
                <th className="p-4 font-ui text-[15px] font-bold text-zinc-700">
                  Opus Clip
                </th>
                <th className="p-4 font-ui text-[15px] font-bold text-zinc-700">
                  Captions
                </th>
                <th className="p-4 font-ui text-[15px] font-bold text-zinc-700">
                  Rewind.ai
                </th>
              </tr>
            </thead>
            <tbody className="text-zinc-600">
              {[
                ["Script input", "Yes", "Transcript-based", "Transcript-based", "Transcript-based", "Yes"],
                ["Video upload input", "Yes", "Yes", "Yes", "Yes (mobile-first)", "Yes"],
                ["Pexels stock matching", "Yes", "Yes (+ iStock, Pixabay)", "Custom stock", "Limited", "Unclear"],
                ["AI-generated clips (not just stock)", "Yes", "No", "No", "Yes", "Yes"],
                ["Preview without signup", "Yes", "Partial", "No", "No", "Yes (fully open)"],
                [
                  "Sign up required to…",
                  "Save project, remove watermark",
                  "Start editing",
                  "Start editing",
                  "Start editing",
                  "Never required",
                ],
                [
                  "Pay only to…",
                  "Download full resolution",
                  "Remove watermark, unlock exports",
                  "Remove watermark, unlock exports",
                  "Remove watermark",
                  "N/A (token-based, no paywall found)",
                ],
              ].map((row, idx, arr) => (
                <tr
                  key={row[0]}
                  className={idx < arr.length - 1 ? "border-b border-zinc-100" : undefined}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-zinc-200 bg-white p-4 text-left font-medium text-zinc-900"
                  >
                    {row[0]}
                  </th>
                  <td className="bg-violet-50/60 p-4 font-medium text-violet-900">
                    {row[1]}
                  </td>
                  <td className="p-4">{row[2]}</td>
                  <td className="p-4">{row[3]}</td>
                  <td className="p-4">{row[4]}</td>
                  <td className="p-4">{row[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
