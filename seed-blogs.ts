import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc } from "drizzle-orm";
import { blogPosts, users } from "./drizzle/schema";
import { getDb } from "./server/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadArticle(file: string) {
  return readFileSync(join(__dirname, "seed", "articles", file), "utf8").trim();
}

dotenv.config();

async function seedBlogs() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available. Check DATABASE_URL.");
  }

  const firstUser = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
  const authorId = firstUser[0]?.id;
  if (!authorId) {
    throw new Error("No users found. Create a user first, then re-run this script.");
  }

  const now = new Date();
  const posts = [
    {
      authorId,
      title: "How to Spy on Competitor Instagram Reels (The Exact Method)",
      slug: "guide-spy-on-competitor-instagram-reels",
      excerpt:
        "If you want to grow faster on Instagram, you need a repeatable way to study what is already working. Here is the exact method creators use to learn from competitor Reels without crossing ethical lines.",
      metaTitle: "How to Spy on Competitor Instagram Reels | SpyReels",
      metaDescription:
        "Learn the exact method to spy on competitor Instagram Reels legally, find what is working in your niche, and use those insights to grow faster.",
      coverImageUrl: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1200&q=80",
      tags: ["competitor research", "instagram reels", "growth strategy"],
      status: "published" as const,
      publishedAt: now,
      content: `
If you are serious about growth, you eventually stop asking what you should post and start asking what the market is already rewarding. That is where learning how to spy on competitor Instagram reels becomes a skill instead of a guilty habit. You are not looking for someone to copy. You are looking for proof: proof of hooks, pacing, topics, formats, and calls to action that keep people watching when attention is the real currency.

## Why creators learn how to spy on competitor Instagram reels in the first place

Most niches are not mysterious. The same emotional triggers show up again and again: fear of falling behind, curiosity about a shortcut, the desire to feel understood, the need for a simple plan. The difference between creators who compound and creators who stall is not talent. It is research cadence. When you know how to spy on competitor Instagram reels consistently, you stop guessing which angles deserve a full production week. You start from structures that already earned attention.

## How to spy on competitor Instagram reels the ethical way

Public content is public for a reason. The ethical line is simple: study patterns, do not lift lines. When you spy on competitor Instagram reels, you are reading the mechanics of a performance: opening tension, how fast the edit moves, where the creator repeats a phrase for emphasis, how they transition from story to lesson, and what they ask the viewer to do next. Take notes like a director, not like a plagiarist. If you find yourself copying a joke verbatim or mimicking a personal story, you have left research and entered theft.

## Build a short list of accounts worth watching

Start with five to eight accounts that sit close to your niche but are not identical clones of you. Mix sizes. Include one or two accounts slightly above your level and one or two accounts punching above their follower count. The goal is variety in constraints: different budgets, different filming setups, different offers. You want a sample that reveals what is structural versus what is personality.

## How to spy on competitor Instagram reels without drowning in tabs

The biggest mistake is passive scrolling. You open Instagram, watch two Reels, get distracted by DMs, and call it research. Instead, run a focused session once or twice a week. For each account, capture the last twenty to thirty Reels you can access, then sort mentally (or in a spreadsheet) by what matters: hook type, topic, format, length, and obvious engagement signals you can see publicly. You are building a map, not collecting random inspiration.

## What to log when you spy on competitor Instagram reels

Create a simple scorecard. Hook: one sentence describing the open loop. Body: is it story-led, list-led, or demo-led? Proof: do they show receipts, screenshots, b-roll, or none? CTA: comment, save, follow, or soft none? Watch the first three seconds twice. That is where most Reels win or die. If you cannot explain the hook in one sentence, you have not understood it yet.

## Turn patterns into your next ten ideas

Once you see three different accounts land the same hook shape, you have found a market truth. Your job is not to reuse their words. Your job is to apply the shape to your own stories, your own frameworks, and your own proof. This is how research becomes originality: same skeleton, new organs.

## How to spy on competitor Instagram reels faster as you scale

As you publish more, you will want speed without sloppiness. That means templates, saved searches, repeatable note formats, and a habit of reviewing winners monthly. Speed is not about watching more. It is about comparing more intelligently.

## Common mistakes that make competitor research useless

Skipping transcription-level detail is the classic error. A hook sounds simple until you write it down and realize it is doing three jobs at once. Another mistake is only studying mega accounts whose distribution is inflated by audience size. A third mistake is chasing trends that do not fit your offer, which creates views that never convert.

## How to spy on competitor Instagram reels and still sound like you

Your voice is the moat. Research informs your decisions; it should not replace your point of view. Keep a list of phrases you would never say, topics you care about deeply, and stories only you can tell. When you rebuild a structure, run it through that filter. If it sounds like a cover band, rewrite until it sounds like your band.

## Benchmarking proof and pacing when you spy on competitor Instagram reels

Two Reels can use the same hook shape and still get wildly different results because proof and pacing change how believable the story feels. When you spy on competitor Instagram reels, do not stop at the opening line. Watch where the creator introduces receipts: a screenshot, a number on screen, a quick demo, a client message, a calendar view, a before-and-after clip. Note the timestamp where proof appears. Early proof can feel aggressive but it can also stop skepticism fast. Late proof can work if the hook promises a story payoff and the viewer is willing to wait. Pacing is the other hidden variable. Count how often the visual changes in the first five seconds. Listen for sentence length. Notice if they repeat a phrase for emphasis. Those are not “style choices.” They are retention tools. Your job is not to mimic their personality. Your job is to understand which tools fit your offer and your filming constraints.

## How to spy on competitor Instagram reels when competitors archive or delete content

Sometimes your best learning material disappears. Creators clean feeds, brands rebrand, and older winners vanish. That is why research should be captured, not admired in the moment. If you find a Reel that nails a structure, save the link, write the hook in your notes, and describe the body beats in your own words the same day. If you rely on memory, you will remember the vibe and forget the mechanics. Another practical habit is to track seasonal cycles: tax season for finance, January for fitness, summer for travel. Competitors often repeat the same structural playbooks each year with new examples. When you keep a lightweight library, you are not dependent on a single account staying perfect forever.

## Turning competitor intelligence into a publishing calendar you can keep

Research should collapse into decisions. After a ninety-minute session, you should walk away with at least six concrete ideas: three hook angles, two format experiments, and one “stretch” concept that is slightly outside your comfort zone. Assign each idea to a filming day and define success in advance. Success might be completion rate, comment quality, saves, or outbound DMs if you sell services. When you connect research to a calendar, you stop treating competitor content like entertainment and start treating it like a pipeline.

If you want a faster, cleaner way to do this every week, SpyReels is built for the boring parts: pulling competitor Reels into a sortable view, surfacing what actually performed, and helping you move from observation to script without losing your voice. You still bring the judgment. SpyReels brings the workflow so you spend less time hunting and more time publishing.
      `.trim(),
    },
    {
      authorId,
      title: "The Best Instagram Reels Script Generator (And How to Use It)",
      slug: "guide-instagram-reels-script-generator",
      excerpt:
        "A script generator is only as good as the structure behind it. Here is how to pick a real Instagram Reels script generator, feed it the right inputs, and edit the output so it sounds human.",
      metaTitle: "Best Instagram Reels Script Generator 2026 | SpyReels",
      metaDescription:
        "Stop staring at a blank page. The best Instagram Reels script generator uses proven viral structures to write your script in under 5 minutes.",
      coverImageUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&q=80",
      tags: ["script generator", "instagram reels", "ai content"],
      status: "published" as const,
      publishedAt: now,
      content: `
Blank-page syndrome is not a discipline problem. It is an information problem. When you sit down to write, you are trying to invent structure and language at the same time. That is why so many creators quietly Google variations of instagram reels script generator late at night. They are not lazy. They are trying to buy speed without buying cringe. The trick is knowing what a generator can do, what it cannot do, and how to edit like a human so the final script still feels like you.

## What an Instagram reels script generator should actually generate

A good generator should not hand you generic motivation quotes. It should output a tight arc: hook, escalation, proof or demonstration, a memorable line, and a CTA that matches your goal. If the tool cannot anchor itself to a format, you will get word salad that sounds confident and says nothing. Before you trust any instagram reels script generator, test it on one topic you know deeply. If you would not film the output without heavy edits, keep looking.

## The inputs that make an Instagram reels script generator useful

Most creators type a topic and hope. Better inputs look like this: audience, pain, desired outcome, your credibility, one proof point, the action you want, and a tone constraint. Example: busy parents, dinner chaos, faster weeknight meals, you are a chef with ten years in restaurants, one quick technique, comment “recipe,” friendly tone. That single paragraph of context changes the entire shape of the script.

## How to use an Instagram reels script generator without sounding robotic

Read the draft out loud. If you stumble, the viewer will stumble. Replace stiff transitions with how you actually speak. Swap repeated adjectives for specifics: not “amazing results” but “went from twenty minutes to seven.” Add one personal beat: a mistake you made, a detail from your week, a line that could only come from your life. Generators are strong at scaffolding. You are strong at truth.

## Editing passes that take ten minutes and save your reputation

Pass one is truth: remove anything you cannot defend. Pass two is pace: cut lines that explain what the next line already shows. Pass three is CTA clarity: one primary ask. Pass four is platform fit: shorter sentences, stronger verbs, fewer abstractions. A great instagram reels script generator gets you to pass zero. You still run the passes.

## When not to rely on an Instagram reels script generator

If you are processing grief, controversy, or regulated claims, slow down. Tools can help you organize thoughts, but they should not replace judgment. Also skip generator-first workflows when you are brand new and still discovering your voice. Early on, write manually enough that you know what “you” sounds like. Then use a generator to scale what already works.

## Turning generator output into a filmed Reel people finish

Scripts are not essays. Write for the ear. Put the hook in the first two seconds on paper, then film it like you mean it. If your generator gives you a sixty-second draft, consider a thirty-second cut. Completion rate matters. Tight beats vague.

## How teams use an Instagram reels script generator without losing brand voice

Create a shared style guide: banned phrases, preferred CTAs, examples of hooks that worked, and three “sounds like us” sample scripts. Feed that into your process every time. The generator becomes a junior writer with a strong brief, not a creative director.

## How to evaluate an Instagram reels script generator in ten minutes

Run the same prompt through three tools. Compare structure, not adjectives. Which output gives you a clean hook, a clear middle, and a CTA that matches your business goal? Which output uses specifics instead of hype? Which output sounds closest to spoken English when you read it aloud? If two tools look similar, pick the one that fits your workflow: exports, collaboration, saving drafts, and whether it helps you start from proven formats instead of generic “tips.” The best Instagram reels script generator for you is the one you will actually use twice a week, not the one with the flashiest demo.

## The difference between a prompt and a creative brief for your Instagram reels script generator

A prompt is “write me a Reel about productivity.” A brief is audience, constraint, proof, offer, tone, and taboo topics. Briefs produce scripts you can film without rewriting the whole arc. If you keep getting bloated intros, your brief is missing a rule: “Start with tension, no greetings.” If you keep getting weak CTAs, add: “One CTA only, comment-based.” Treat the generator like a contractor. Contractors do better with boundaries.

## Instagram reels script generator output: a three-layer rewrite that keeps your voice

Layer one is facts: verify every claim. Layer two is rhythm: shorten sentences, remove throat-clearing, replace passive voice. Layer three is personality: add one story beat, one opinion, one line that sounds like your comments section talks. Most creators stop at layer one and wonder why the Reel feels flat. Flat is usually missing layer three.

## When an Instagram reels script generator saves you the most time

Generators shine when you already know the topic and you need speed: launches, FAQs, follow-ups to a viral post, repurposing a long video into a tight Reel, or batching three scripts in one sitting. They struggle when you are still unclear on positioning. Fix positioning first. Then the generator becomes multiplication, not confusion.

## One last reality check about any Instagram reels script generator

If the output feels “too clean,” it will also feel too familiar. Add friction on purpose: a contrarian line, a specific number, a tiny confession, a joke only your audience would get. Those details are not decoration. They are the fingerprints that make people trust you. The generator gives you scaffolding. You still owe the viewer a human.

SpyReels fits here because it connects research to writing: you can move from competitor patterns into script scaffolding without bouncing between five tools. You still edit. SpyReels just removes the friction between “I saw what worked” and “I have something filmable today.”
      `.trim(),
    },
    {
      authorId,
      title: "Why Do My Instagram Reels Get No Views? (7 Real Reasons)",
      slug: "guide-why-reels-get-no-views",
      excerpt:
        "Low views usually come from a small set of fixable problems. Here are seven real reasons your Reels stall, how to diagnose each one, and what to change first.",
      metaTitle: "Why Do My Instagram Reels Get No Views? Fix This in 2026",
      metaDescription:
        "If your Reels are stuck at 200 views, something specific is broken. Here are the 7 real reasons and exactly how to fix each one.",
      coverImageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80",
      tags: ["low views", "instagram reels", "algorithm fix"],
      status: "published" as const,
      publishedAt: now,
      content: `
If you are asking why do my instagram reels get no views, you are probably tired of hearing vague advice like “post more” or “be consistent.” Consistency matters, but it is not an explanation. Views are the outcome of a chain: stop the scroll, keep attention, earn a reaction, earn repeats, and signal relevance to strangers. When any link breaks, distribution dies. The good news is that most low-view Reels fail for a small set of reasons you can actually test.

## Why do my instagram reels get no views: reason one, the hook is soft

If the first two seconds feel like a warm-up, you lost. People decide fast. A soft hook sounds like context before payoff: introductions, logos, slow greetings, or a polite runway. Fix it by starting with tension, a bold claim, a question with stakes, or a visual pattern interrupt. Film the hook first until it feels almost too direct. Direct wins.

## Why do my instagram reels get no views: reason two, the wrong audience sees it

Sometimes the creative is fine but the topic is mismatched to your followers, or your hashtags and on-screen text send mixed signals about who it is for. Tighten the who: say it plainly in the first line. If you teach bookkeeping, say “for freelancers who hate taxes” early. Clarity helps distribution match you with interested strangers.

## Why do my instagram reels get no views: reason three, the pacing drags

Long sentences, slow cuts, and “essay voice” murder retention. Reels reward momentum. If you would not watch your own draft without skipping, assume the algorithm agrees. Cut dead air, split one idea into two tighter beats, and add a visual change every few seconds when possible.

## Reason four: you are teaching without proof

Teaching content works when you show receipts: a screen recording, a demo, a before and after, a simple diagram. If you only talk, you compete with everyone else talking. Proof is a retention anchor.

## Reason five: your CTA fights the content

Asking for a follow on a Reel that has not earned trust feels heavy. Asking for a comment without giving an easy prompt feels confusing. Match CTA strength to the value delivered in that single clip. A simple “comment yes if you do this too” often outperforms a laundry list of asks.

## Reason six: you are copying formats that do not fit your niche

Trend formats travel fast, but not every trend fits every offer. If a format looks cool but does not clarify what you sell or who you help, you can get empty views or none at all. Borrow structure, not identity.

## Reason seven: you are not iterating with data

If you post once a week and never compare hooks, you are flying blind. Low views become a mystery instead of a feedback loop. Keep a simple log: hook type, length, topic, and what you would change next time.

## A seven-day fix-it plan when you keep asking why do my instagram reels get no views

Day one: rewrite hooks only. Day two: shorten scripts by twenty percent. Day three: add one proof beat to each draft. Day four: standardize one CTA style. Day five: film three hooks for the same script and pick the best. Day six: study five competitor opens. Day seven: post two versions as separate tests if you can.

## The mindset shift that actually changes results

Stop treating views like a verdict on your worth. Treat them like diagnostics. The market is telling you where the leak is. Fix the leak, keep your voice, publish again.

## Why do my instagram reels get no views even when I post daily

Posting frequency can help you learn faster, but it does not replace diagnosis. If every Reel shares the same weak hook, you are practicing the wrong skill on repeat. Use daily posting as a testing engine, not a superstition. Change one variable at a time: hook on Monday, pacing on Wednesday, proof on Friday. If you change five things at once and views move, you will not know what to repeat.

## Why do my instagram reels get no views after I “do everything right”

Sometimes you follow best practices and still stall because your niche is crowded with similar promises. “Right” is not the same as differentiated. If your Reel could be posted by ten other accounts without changing a line, the algorithm has no reason to push you. Tighten your who, sharpen your claim, and show a detail only you would know. Differentiation is not louder music. It is a clearer point of view.

## A practical checklist before you publish the next Reel

Ask: is the promise obvious in two seconds? Is there proof within the first third? Is there one CTA? Is the language spoken, not written? Would a stranger understand the value without background context? If you answer no once, fix that before you worry about hashtags.

## Why do my instagram reels get no views: the hidden cost of weak captions and on-screen text

Your script might be strong, but if on-screen text is tiny, generic, or misaligned with the hook, viewers bounce early. Text is a second hook. Use it to reinforce the promise, not to repeat your bio. Keep key phrases short enough to read on a phone held at arm’s length.

## A simple “post-mortem” you can run in five minutes

Re-watch your Reel on mute. If the story is unclear without audio, fix the visuals. Re-watch with audio only. If the hook does not land, rewrite the first line. If the ending feels abrupt, add a one-sentence bridge before the CTA. Small post-mortems prevent you from repeating the same invisible mistake for a month straight.

SpyReels helps you answer “why do my instagram reels get no views” with evidence, not vibes: see what is winning in your niche, compare structures, and tighten your scripts with a workflow built for Reels. You still do the creative work. SpyReels makes the feedback loop faster.
      `.trim(),
    },
    {
      authorId,
      title: "30 Instagram Reels Hook Examples That Stop the Scroll",
      slug: "guide-instagram-reels-hook-examples",
      excerpt:
        "Stop the scroll with proven hook shapes: mistakes, contrast, proof-first opens, plus thirty rewrite-friendly examples you can adapt for your niche.",
      metaTitle: "30 Instagram Reels Hook Examples That Get 10x More Views",
      metaDescription:
        "The best Instagram Reels hook examples broken down by niche and format. Copy these proven openers to stop the scroll and get more views instantly.",
      coverImageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&q=80",
      tags: ["reels hooks", "content strategy", "viral formula"],
      status: "published" as const,
      publishedAt: now,
      content: loadArticle("04-guide-instagram-reels-hook-examples.md"),
    },
    {
      authorId,
      title: "How to Find Viral Reels in Your Niche Before Everyone Else",
      slug: "guide-find-viral-reels-your-niche",
      excerpt:
        "Build a competitor map, search by problems (not vibes), and run a weekly research ritual that turns patterns into scheduled content tests.",
      metaTitle: "How to Find Viral Reels in Your Niche (2026 Method)",
      metaDescription:
        "The exact system top creators use to find viral Reels in their niche before they peak so they can ride the trend instead of chasing it.",
      coverImageUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&q=80",
      tags: ["viral reels", "trend research", "niche growth"],
      status: "published" as const,
      publishedAt: now,
      content: loadArticle("05-guide-find-viral-reels-your-niche.md"),
    },
    {
      authorId,
      title: "The Best Instagram Reels Analytics Tool in 2026 (Honest Comparison)",
      slug: "guide-instagram-reels-analytics-tool",
      excerpt:
        "Pick analytics tooling that drives decisions, not dashboards: what to measure, what to ignore, agency workflows, and a scorecard that connects metrics to creative fixes.",
      metaTitle: "Best Instagram Reels Analytics Tool 2026 | Honest Comparison",
      metaDescription:
        "Compare the best Instagram Reels analytics tools in 2026. Find out which tool gives you the competitor intelligence and data to grow faster.",
      coverImageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80",
      tags: ["analytics tool", "instagram reels", "competitor analysis"],
      status: "published" as const,
      publishedAt: now,
      content: loadArticle("06-guide-instagram-reels-analytics-tool.md"),
    },
    {
      authorId,
      title: "How to Grow on Instagram with Reels When You Have Under 10K Followers",
      slug: "guide-grow-instagram-reels-under-10k",
      excerpt:
        "A realistic growth playbook for nano creators: tighten your who, post a sustainable cadence, use proof-first Reels, and build community loops that create shares.",
      metaTitle: "How to Grow Instagram with Reels Under 10K Followers (2026)",
      metaDescription:
        "The exact Reels growth strategy working for nano creators under 10K followers in 2026. Real tactics, no fluff, no big budget required.",
      coverImageUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80",
      tags: ["small creators", "instagram growth", "under 10k"],
      status: "published" as const,
      publishedAt: now,
      content: loadArticle("07-guide-grow-instagram-reels-under-10k.md"),
    },
    {
      authorId,
      title: "How to Reverse Engineer Viral Instagram Reels (Step by Step)",
      slug: "guide-reverse-engineer-viral-reels",
      excerpt:
        "Treat viral Reels like game tape: map beats, study comments, separate format from personality, and convert patterns into original scripts you can film this week.",
      metaTitle: "How to Reverse Engineer Viral Instagram Reels | SpyReels",
      metaDescription:
        "Viral Reels are not accidents. They follow repeatable structures. Learn the exact method to break down any viral Reel and apply the formula to your content.",
      coverImageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80",
      tags: ["viral content", "reel structure", "content research"],
      status: "published" as const,
      publishedAt: now,
      content: loadArticle("08-guide-reverse-engineer-viral-reels.md"),
    },
    {
      authorId,
      title: "The Instagram Reels Script Template That Works for Any Niche",
      slug: "guide-instagram-reels-script-template",
      excerpt:
        "A fill-in-the-blanks five-block template (Hook, Stakes, Proof, Payoff, CTA) plus niche variants for teaching, services, and product demos—plus batching tips.",
      metaTitle: "Instagram Reels Script Template for Any Niche (Free 2026)",
      metaDescription:
        "A proven fill-in-the-blank Instagram Reels script template with examples for fitness, business, food, travel, and any other niche.",
      coverImageUrl: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&q=80",
      tags: ["script template", "reels writing", "content creation"],
      status: "published" as const,
      publishedAt: now,
      content: loadArticle("09-guide-instagram-reels-script-template.md"),
    },
    {
      authorId,
      title: "The Best Time to Post Reels on Instagram in 2026 (Based on Data)",
      slug: "guide-best-time-to-post-reels-2026",
      excerpt:
        "Treat posting time like an experiment: define audience schedules, run two-window tests, track early saves and comments, and adjust seasonally without fooling yourself.",
      metaTitle: "Best Time to Post Reels on Instagram 2026 | Data-Backed Guide",
      metaDescription:
        "Find the best time to post Reels on Instagram in 2026 based on real engagement data. Includes time zone guide and a 14-day testing plan.",
      coverImageUrl: "https://images.unsplash.com/photo-1533750349088-cd871a92f312?w=1200&q=80",
      tags: ["posting time", "instagram algorithm", "reels strategy"],
      status: "published" as const,
      publishedAt: now,
      content: loadArticle("10-guide-best-time-to-post-reels-2026.md"),
    },
  ];

  let ok = 0;
  let failed = 0;
  for (const blog of posts) {
    try {
      await db.insert(blogPosts).values(blog);
      console.log(`✓ ${blog.title}`);
      ok++;
    } catch (err: any) {
      console.error(`✗ ${blog.title}: ${err?.message ?? String(err)}`);
      const cause = err?.cause;
      if (cause) {
        console.error(`  cause: ${cause?.message ?? String(cause)}`);
        if (typeof cause === "object" && cause !== null) {
          const c = cause as { errno?: number; sqlState?: string; sqlMessage?: string };
          if (c.errno != null || c.sqlMessage) {
            console.error(`  mysql errno=${c.errno} sqlState=${c.sqlState} sqlMessage=${c.sqlMessage}`);
          }
        }
      }
      if (err?.stack) console.error(err.stack);
      failed++;
    }
  }
  console.log(`Done. ${ok} inserted, ${failed} failed (of ${posts.length} total).`);
}

seedBlogs().catch((error) => {
  console.error("Failed to seed blog posts:", error);
  process.exit(1);
});
