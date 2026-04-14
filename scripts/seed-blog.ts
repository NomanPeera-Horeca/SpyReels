import * as dotenv from "dotenv";
import { asc } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { createBlogPost, getDb } from "../server/db";

dotenv.config();

async function seedBlogPosts() {
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
      title: "How to Go Viral on Instagram Reels in 2026 (Without Guessing)",
      slug: "how-to-go-viral-on-instagram-reels-2026",
      excerpt:
        "Most creators guess what to post. The ones going viral don't. Here's the data-driven framework that actually works in 2026.",
      metaTitle: "How to Go Viral on Instagram Reels in 2026 (Without Guessing) | SpyReels",
      metaDescription:
        "Most creators guess what to post. The ones going viral don't. Here's the exact data-driven framework top Instagram creators use to go viral consistently in 2026.",
      tags: ["instagram reels", "viral content", "content strategy"],
      content: `Going viral on Instagram Reels in 2026 is not about luck, trending audio, or posting at the perfect time. It is about studying what already works in your niche, extracting the structure, and applying it to your own content. Creators who do this consistently outperform those who guess every single time.
What does it actually mean to go viral on Instagram Reels in 2026?
A Reel "goes viral" when the Instagram algorithm distributes it beyond your existing followers to a much larger audience. In 2026, this happens when a Reel achieves strong signals across five metrics: watch-through rate, shares, saves, comments, and follows. Likes have been largely deprioritized as a ranking signal. A Reel with 500 shares and 80% watch-through rate will reach far more people than one with 5,000 likes but low retention.
Understanding this changes your entire creative strategy. Your goal is not to make content people like. It is to make content people finish watching and send to someone else.
Why most Instagram creators never go viral
The single biggest reason most Reels fail is that creators make content based on intuition rather than data. They ask "what do I feel like posting today?" instead of "what structure is already driving millions of views in my niche?"
According to Instagram's own data, 55% of all Reel views come from non-followers. This means the algorithm is actively distributing content to new audiences — but only when it detects strong engagement signals in the first few hours. If your Reel does not generate those signals quickly, distribution stops. The content dies silently.
The creators consistently breaking through are not more talented. They have a research process. They know which hooks are working in their niche this month. They know the pacing, the script structure, and the CTA formats that generate shares. And they apply those patterns to new content every single week.
How does the Instagram algorithm decide which Reels to push in 2026?
The Instagram Reels algorithm in 2026 ranks content using five signals in order of importance: watch-through rate, shares, saves, comments, and follows. Watch-through rate is the most heavily weighted signal by a significant margin. Instagram measures what percentage of viewers watch your Reel all the way to the end and how many replay it. Reels that score above 70% watch-through consistently receive broader distribution.
Shares — specifically DMs — are the second strongest signal. When someone sends your Reel to another person in a direct message, Instagram treats this as a strong indicator of value. It tells the algorithm that your content is worth passing along, which triggers expanded reach.
Saves indicate that viewers found your content valuable enough to return to. This signal is particularly strong for educational and tutorial content. Comments signal active engagement and conversation, which extends the life of a post in the algorithm.
The hook is the most important two seconds you will ever film
Reels with a storytelling hook or jump cut in the first three seconds are 72% more likely to go viral, according to 2026 engagement data. The hook has one job: stop the scroll and create an open loop that the viewer must resolve by watching the rest of the Reel.
The four hook structures that perform consistently across niches are: a surprising statistic the audience does not know, a counterintuitive claim that challenges a common belief, a direct warning about a mistake the viewer is likely making, and a bold promise of a specific result they want.
What does not work: starting with a logo, a slow intro, a greeting, or any form of context-setting before the hook. By the time you say "Hey guys, today I want to talk about," your viewer is already three Reels further down the feed.
What is the viral Reels script structure used by top creators?
Every high-performing Reel follows a four-part structure: hook, tension, payoff, and CTA. The hook captures attention in the first two to three seconds. The tension section builds toward the payoff without giving it away too early, keeping viewers watching through a series of connected insights. The payoff delivers the resolution the hook promised. The CTA directs the viewer to take a specific action.
The best CTAs in 2026 are comment-based — asking a question that is easy to answer — or save-based, telling viewers to save the Reel because they will need the information later. Both of these generate algorithm-friendly engagement signals. Follow CTAs work but require more commitment and convert at a lower rate.
How to find viral Reels in your niche (the research process)
The fastest path to viral content is studying what is already viral. Identify three to five creators in your niche who are consistently generating high view counts. Focus on accounts with under 100K followers who are punching above their weight — these accounts are doing something structurally interesting, not just coasting on an existing audience.
The problem with researching on Instagram directly is that profiles show Reels in reverse chronological order. You cannot see which ones performed best without scrolling through everything and manually tracking view counts.
SpyReels solves this. Enter any public Instagram handle and it pulls all their Reels sorted by views, likes, comments, and engagement rate — highest to lowest. You can filter by timeframe to see what is working right now versus all time. For a creator with 200 Reels, this analysis takes minutes instead of hours.
Once you have identified the top performers, transcribe them. SpyReels uses Whisper AI to transcribe any Reel with one click, giving you the exact script including the hook wording, body structure, and CTA format. After transcribing ten to fifteen viral Reels in your niche, patterns become obvious. You will see the same hook structures, the same pacing, the same CTA formats appearing across completely different creators.
The 3x3 hashtag strategy that improves reach in 2026
Instagram's algorithm confirmed that effective hashtag use caps at around nine tags. Using more than nine actually hurts reach. The 3x3 framework uses three hashtags for your content topic, three for your target audience, and three for the dream result your audience wants. This signals to the algorithm exactly who should see your content, improving the match rate between your Reel and the right audience.
How long should an Instagram Reel be in 2026?
Reels between 15 and 90 seconds perform best for most content types based on 2026 benchmark data. Shorter Reels generate higher completion rates because they are easier to watch all the way through. Longer Reels can perform well if every second is intentional, but they require exceptionally strong hooks to maintain retention.
The test for any Reel is simple: if you removed a segment, would the Reel be worse? If the answer is no, cut it. Every second that does not serve the hook, build tension, deliver the payoff, or prompt a response is costing you watch time.
What is the fastest way to start going viral on Instagram Reels?
The fastest path is to study three viral Reels in your niche this week, transcribe them, identify the common hook structure, and create your next three Reels using that same structure applied to your own topics. This process produces evidence-based content rather than guesswork. SpyReels automates the research and transcription step, making the entire process repeatable in about ten minutes per Reel.
Frequently asked questions about going viral on Instagram Reels
How long does it take to go viral on Instagram Reels?
Most viral Reels show their performance signal within the first 24 to 48 hours. If a Reel is going to break out, you typically see above-average views and shares within the first day. Consistent posting increases the frequency of breakthrough content.
Do hashtags still help Reels go viral in 2026?
Hashtags help the algorithm categorize your content but are not a primary driver of viral reach. The 3x3 strategy of nine targeted hashtags is more effective than using thirty generic ones.
Does posting time affect whether a Reel goes viral?
Posting when your audience is most active helps generate early engagement signals, which influences algorithmic distribution. The first hour after posting is your most important window. However, the content structure matters far more than the posting time.
What niche gets the most views on Instagram Reels in 2026?
Business, personal finance, fitness, food, and education consistently generate high view counts. But any niche can produce viral content when the hook is strong and the structure matches what is already working.
How do I go viral on Instagram Reels with zero followers?
New accounts can go viral because the Reels algorithm distributes content based on quality signals, not follower count. A new account with a strong hook and proven structure can outperform established accounts. Start by studying what is already working and applying those patterns from your very first post.`,
      status: "published" as const,
    },
    {
      authorId,
      title: "How to Spy on Viral Instagram Reels and Steal the Structure (Legally)",
      slug: "how-to-spy-on-viral-instagram-reels",
      excerpt:
        "The fastest way to grow on Instagram is to study what's already working in your niche. Here's the exact process top creators use.",
      metaTitle:
        "How to Spy on Viral Instagram Reels and Steal the Structure (Legally) | SpyReels",
      metaDescription:
        "The fastest way to grow on Instagram is to study what's already working in your niche. Here's the exact research process top creators use to reverse-engineer viral Reels.",
      tags: ["instagram reels", "competitor research", "content strategy"],
      content: `Studying what already works in your niche is not copying. It is the same research process used by every top creator, every major brand, and every professional content team on the planet. The creators consistently going viral are not more creative — they are better researchers. This guide walks through the exact process for finding viral Reels in any niche and extracting the structure so you can apply it to your own content.
What does it mean to "spy on" Instagram Reels?
Spying on Instagram Reels means systematically analyzing high-performing content in your niche to identify the patterns, structures, and formats that consistently generate views, shares, and saves. It is competitive research applied to content creation. You are not copying the content. You are studying the underlying mechanics that make it work, then applying those mechanics to your own original ideas.
Every professional content team does this. Ad agencies analyze competitor campaigns before writing new ones. Copywriters study controls before testing new copy. Content creators who study viral Reels before filming their own produce better content faster than those who start from a blank page every time.
Why most creators skip competitor research (and why that is a mistake)
Most creators skip research because it feels like cheating or because they do not have a systematic way to do it. Scrolling a competitor's profile gives you a general sense of their content style but no clear picture of which specific Reels performed best and why.
The result is that most creators make content based on what felt good when they were filming, not on what the data shows actually works. This is the primary reason content performance is so inconsistent for most accounts. Strong weeks followed by weak ones, with no clear understanding of why.
The fix is a research process that is systematic, repeatable, and grounded in real performance data.
How to identify the right accounts to study
Not all accounts are worth studying. You want creators who are generating disproportionately high view counts relative to their follower count. A creator with 20K followers whose Reels regularly hit 500K views is doing something structurally interesting. A creator with 2 million followers whose Reels hit 100K views is just coasting on audience size.
Look for accounts in your specific niche, not just accounts in your general topic area. If you are a fitness creator specializing in home workouts for beginners, study other home workout creators, not just general fitness accounts. The closer the niche alignment, the more transferable the patterns you find.
Aim to identify three to five accounts for each research session. More than that produces diminishing returns because the same patterns start repeating.
What should you look for when analyzing viral Reels?
When you analyze a viral Reel, you are looking for five specific things:
The hook structure: what happened in the first two to three seconds? Was it a surprising statement, a question, a bold visual, or a pattern interrupt? Write down the exact phrasing.
The pacing: how many cuts in the first five seconds? What was the average segment length? Fast cuts generate higher early retention. Slow segments bleed watch time.
The information structure: did the body of the Reel deliver one clear idea or multiple points? How were the points sequenced? Did each one build on the last?
The CTA format: did the Reel ask for a comment, a save, a follow, or nothing? What was the exact wording? Comment CTAs that ask specific easy questions ("Yes or no?" "Which one are you?") consistently outperform generic ones ("Follow for more").
The shareability factor: why would someone send this to a friend? Was it relatable, surprising, educational, or funny? The best Reels make the viewer think of someone specific they want to share it with.
How to find the top performing Reels from any Instagram account
Instagram's native interface shows Reels in reverse chronological order, which makes identifying top performers time-consuming. You would need to scroll through an entire profile and manually compare view counts, which takes significant time for active accounts.
SpyReels automates this. Enter any public Instagram handle and the tool scrapes all their Reels and ranks them by performance — views, likes, comments, and engagement rate, from highest to lowest. You can filter by timeframe to see what is working right now versus historically. For an account with 150 Reels, this analysis takes about two minutes instead of an hour.
The engagement rate metric is particularly useful because it normalizes performance across accounts of different sizes. A Reel with 50K views on a 5K-follower account has a much higher engagement rate than the same 50K views on a 500K-follower account. High engagement rate signals strong content quality, not just audience size.
How to transcribe a viral Reel to extract the exact script
Watching a viral Reel ten times will give you a rough sense of the structure. Reading the exact transcript gives you something far more useful: the precise wording of the hook, the specific phrases used in each segment, and the exact CTA format.
Small wording differences matter more than most creators realize. "Most people get this wrong" and "Here is what nobody tells you about this" are structurally similar hooks but they work through different psychological mechanisms. The first implies the viewer is making a mistake. The second implies exclusive information. Both are effective but in different situations.
SpyReels transcribes any Reel with one click using Whisper AI. You get the full script in seconds. After transcribing the top ten to fifteen Reels from your research accounts, copy the transcripts into a document and look for patterns. You will find that certain hook phrases, certain structural sequences, and certain CTA formats appear repeatedly across completely different creators. These are your templates.
How to apply a viral structure to your own content
This is the step most guides skip. You have a proven structure from a high-performing Reel. How do you use it without copying?
The answer is to keep the emotional mechanic and replace all the content. Every hook works through a specific psychological mechanism: fear of missing out, curiosity, fear of making a mistake, desire for a specific outcome. Identify the mechanism. Then apply it to your topic.
If the hook was "Stop doing X if you want Y" in a cooking niche, the template is "warning someone away from a mistake that costs them the result they want." Apply that mechanic to your niche: "Stop doing X if you want Y" in a business context, a fitness context, a personal finance context.
SpyReels has a Re-Create feature that automates this. Select a high-performing Reel, click Re-Create, and the AI generates a new script using the same proven structure applied to your topic in your voice. This is a starting point — you edit it, add your personal examples, and make it yours. The structural work is done.
How often should you do competitor research on Instagram?
The most effective cadence is thirty to sixty minutes of research per week before creating any content. This is enough to stay current with what is working without getting lost in analysis. Identify three to five viral Reels per session, transcribe the strongest ones, add the patterns to your template library, and create your next week's content based on what you find.
Over time, this builds a pattern library specific to your niche. You stop starting from scratch every week and start drawing from a growing bank of proven structures. Content quality improves systematically. Performance becomes more consistent. You stop guessing.
What tools do you need to spy on Instagram Reels effectively?
The minimum effective toolkit is a way to see all Reels from any account ranked by performance, and a way to transcribe the ones worth studying. SpyReels provides both in one tool, with the addition of AI-powered script recreation to close the loop from research to production.
Manual research works but is slow. Spending four hours manually analyzing competitor Reels every week is not sustainable alongside a content production schedule. Automating the research with the right tool makes the process fast enough to actually maintain as a weekly habit.
Frequently asked questions about researching viral Instagram Reels
Is it legal to analyze competitor Instagram Reels?
Yes. Analyzing publicly available content for research purposes is entirely legal and standard practice in every creative industry. You are studying structure and patterns, not copying content.
Can I see analytics from someone else's Instagram account?
You can see public engagement data — views, likes, and comments — on any public account. Private account data is not accessible. SpyReels works with any public Instagram account.
How do I find viral Reels in my specific niche?
Start with the accounts you already know are performing well in your niche, then use SpyReels to scrape their full Reel history ranked by performance. You can also use the keyword search feature to find viral Reels matching specific topics across all of Instagram.
How many Reels should I analyze before creating content?
Ten to fifteen transcribed Reels from three to five accounts is enough to identify clear patterns. More research produces diminishing returns. The goal is to identify actionable patterns quickly, not to study indefinitely.
Does researching competitor content mean my content will look like everyone else's?
No. You are studying structure, not copying content. The specific ideas, examples, perspectives, and voice in your content come from you. The structure is borrowed from what is already proven to work. This is how every successful creative industry operates.`,
      status: "published" as const,
    },
    {
      authorId,
      title: "How to Write Instagram Reels Scripts That Go Viral Every Time",
      slug: "how-to-write-instagram-reels-scripts-that-go-viral",
      excerpt:
        "A proven script formula used by the fastest-growing Instagram creators. Includes real examples and a step-by-step process.",
      metaTitle: "How to Write Instagram Reels Scripts That Go Viral Every Time | SpyReels",
      metaDescription:
        "A proven script formula used by the fastest-growing Instagram creators. Includes the exact hook-tension-payoff-CTA framework, real examples, and a step-by-step writing process.",
      tags: ["instagram reels", "script writing", "content creation"],
      content: `The fastest-growing Instagram creators in 2026 share one habit that separates them from everyone else: they script their Reels before they film them. Not because scripted content sounds more polished — it often sounds less polished — but because scripting forces every second to be intentional. And intentional content holds attention better than improvised content every single time.
Why do scripted Instagram Reels perform better than unscripted ones?
Scripted Reels outperform unscripted ones because they are optimized for watch-through rate — the single most important metric in the Instagram algorithm in 2026. When every word in a script earns its place, there is no dead air, no filler, and no moment where the viewer can reasonably check out.
The Instagram algorithm measures what percentage of viewers watch a Reel all the way to the end. Reels that score above 70% watch-through rate receive significantly broader distribution. Scripted Reels consistently achieve higher watch-through rates because the pacing is controlled, the tension is deliberate, and the payoff is always worth waiting for.
What is the hook-tension-payoff-CTA script framework?
The hook-tension-payoff-CTA framework is the four-part script structure used by the majority of high-performing Instagram Reels across all niches. It mirrors the psychological structure of any compelling story: create a question that needs answering, build toward the answer, deliver it satisfyingly, and direct the audience to take a specific action.
The hook occupies the first two to three seconds and has one job: stop the scroll by creating an open loop. The tension section builds toward the resolution without giving it away too early. The payoff delivers what the hook promised. The CTA directs the viewer to comment, save, or follow.
Each component has specific best practices that differ based on niche and content type. The sections below cover each one in detail.
How to write an Instagram Reels hook that stops the scroll
The hook is the most important part of your script. Reels with a strong hook in the first three seconds are 72% more likely to go viral based on 2026 engagement data. A weak hook means the rest of the script is irrelevant — viewers are already gone.
The four hook structures that consistently perform across niches are:
The surprising statistic hook reveals a number the audience does not know that reframes their understanding of a topic. Example: "87% of Instagram creators post every week and never break 1,000 views. Here is the one thing they all have in common."
The counterintuitive claim hook challenges a belief the audience holds. Example: "Posting more Reels is actually hurting your growth. Here is why."
The direct warning hook implies the viewer is making a costly mistake. Example: "Stop doing this if you want your Reels to go viral."
The bold promise hook commits to delivering a specific result the viewer wants. Example: "I went from 200 views per Reel to 200K in 90 days. Here is the exact framework."
Each of these hooks creates an open loop — a question or tension that the viewer needs resolved. The open loop is what keeps people watching.
How to write the tension section of a Reels script
The tension section is the body of your Reel. Its job is to build toward the payoff without giving it away too early. The best tension sections deliver a series of connected insights, each one revealing something that leads naturally to the next.
Pacing matters enormously in this section. Cuts every two to three seconds signal to the algorithm that the content is engaging. Long static shots bleed watch time. If you are filming talking-head content, vary your angle or add text overlays to maintain visual variety even without physical cuts.
The number of points in your tension section depends on Reel length. For a 30-second Reel, two to three points is appropriate. For a 60-second Reel, three to four points. The test for each point is whether removing it would make the Reel worse. If not, cut it.
How to write the payoff and CTA
The payoff is the moment the open loop closes. This is what the viewer stayed for. A strong payoff feels worth the wait — it delivers a surprising insight, a clear actionable tip, or a satisfying resolution that justifies the viewer's time investment.
The most common reason Reels fail despite having a strong hook is a weak payoff. Viewers feel cheated. They watched the whole Reel and the ending did not deliver. This destroys share rate and saves rate, both of which are critical algorithm signals.
The CTA comes immediately after the payoff while the viewer is in a peak engagement moment. The most effective CTAs in 2026 are comment-based or save-based. Comment CTAs that ask specific easy questions — "Yes or no?" or "Which one are you?" — generate higher response rates than generic ones like "Let me know in the comments." Save CTAs that explain why viewers will need the information later — "Save this before you film your next Reel" — convert well for educational content.
A complete script example using the framework
Here is a full script structure that works across multiple niches. Replace the brackets with your specific content.
Hook: "The reason most [target audience] never [achieve result] has nothing to do with [common excuse]. It is this."
Tension point 1: "Most people think [wrong belief]. But what actually happens is [reality]."
Tension point 2: "The reason is [insight that explains the reality]. Which means [implication]."
Tension point 3: "And that leads to [consequence that the viewer recognizes from their own experience]."
Payoff: "So instead of [wrong approach], do [correct approach]. The difference is [key distinction that makes the correct approach work]."
CTA: "Have you been doing [wrong approach]? Comment yes or no below."
This structure works because it creates genuine tension through a series of connected insights, delivers a satisfying payoff with a concrete distinction, and ends with a low-commitment comment prompt that generates algorithm-friendly engagement.
How to write faster using viral research
Writing scripts from scratch is the slowest and least reliable way to produce consistently performing content. A faster approach is to start with a proven structure from a Reel that already went viral in your niche, then adapt it to your topic and voice.
The process is: identify a high-performing Reel in your niche, transcribe it to get the exact script, identify the hook structure and body pattern, then rewrite it with your ideas and perspective. The structure is borrowed. The content is original.
SpyReels automates the research and transcription steps. Enter any public Instagram handle to see all their Reels ranked by performance. Click transcribe on the strongest ones to get the exact script. Then click Re-Create to get a new version of that script applied to your topic. You edit the output, add your specific examples and voice, and film it. The structural work is done in minutes rather than hours.
How to edit your script before filming
After writing a first draft, run it through two editing passes before filming.
The watch-through edit: read the script aloud and mark any moment where you would consider stopping if you were a viewer. Cut or rewrite those moments. If a section does not hold your own attention, it will not hold a stranger's.
The payoff test: remove the payoff and read the hook and tension section alone. Does it feel incomplete without the resolution? If yes, the payoff is doing its job. If the hook and tension section feel complete on their own, the payoff is probably weak and needs to be strengthened.
What is the ideal length for an Instagram Reels script in 2026?
Scripts for Reels between 30 and 60 seconds perform best for most educational and business content in 2026. At a natural speaking pace of approximately 130 words per minute, a 30-second Reel script is around 65 words and a 60-second script is around 130 words.
Shorter is generally better for completion rate. The test is not whether you could make the Reel longer, but whether every second of the existing script is earning its place. Cut aggressively. The tighter the script, the higher the watch-through rate, the broader the algorithmic distribution.
Frequently asked questions about writing Instagram Reels scripts
Do I need to memorize my Reels script before filming?
Not necessarily. Many creators use a teleprompter for scripted content. SpyReels has a built-in teleprompter with adjustable speed, font size, and mirroring so you can read your script naturally while filming. This reduces takes significantly and keeps the pacing consistent.
How long should a Reels script be?
For a 30-second Reel, aim for 60 to 75 words. For a 60-second Reel, aim for 120 to 140 words. These ranges allow for natural pacing without rushing or dragging.
Should I write a new script for every Reel?
Yes, but not from scratch. Build a template library of proven hook structures, tension patterns, and CTA formats from your research. New scripts become faster and more consistent as your template library grows.
How do I make a scripted Reel sound natural?
Read the script aloud multiple times before filming to internalize the rhythm. Edit any phrase that does not sound like how you naturally speak. Scripted content sounds unnatural when the words are written rather than spoken — write the script the way you would say it, not the way you would write an email.
What is the best free tool for writing Instagram Reels scripts?
SpyReels lets you research viral Reels in your niche, transcribe the scripts of top performers, and generate new scripts based on proven viral structures — all in one tool with a free plan to start.`,
      status: "published" as const,
    },
  ];

  for (const post of posts) {
    const id = await createBlogPost(post);
    console.log(`Created blog post #${id}: ${post.title}`);
  }

  console.log("Seed complete.");
}

seedBlogPosts().catch((error) => {
  console.error("Failed to seed blog posts:", error);
  process.exit(1);
});
