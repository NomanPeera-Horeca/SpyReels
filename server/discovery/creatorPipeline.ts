/**
 * Creator-first Discover pipeline: niche routing, pillar/topic generation,
 * keyword search, viral scoring, creator collapse, Haiku peer filter.
 */

import Anthropic from "@anthropic-ai/sdk";
import { routeNiche } from "../ai/prompts/niche-routing";
import {
  searchReelsByKeyword,
  type SearchReelData,
} from "../instagram";
import { type ParsedReel, type ScoredReel, scoreReel } from "./scoring";

const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const CREATOR_MIN_FOLLOWERS = 10_000;
const TOPICS_TARGET = 24;
const MAX_RESULTS_PER_TOPIC = 40;
const PEER_SCORE_BATCH = 15;

export interface CreatorDiscoveryPillar {
  name: string;
  why?: string;
  topics: string[];
}

export interface CreatorDiscoveryTopic {
  pillar: string;
  phrase: string;
}

export interface CreatorDiscoveryCreatorEntry {
  rank?: number;
  owner: {
    username: string;
    fullName: string;
    followers: number;
    profilePicUrl: string;
  };
  bestReel: {
    shortcode: string;
    reelUrl: string;
    caption: string;
    views: number;
    likes: number;
    comments: number;
    viralScore: number;
    tier: 1 | 2;
    thumbnailUrl: string;
  };
  foundViaPillar: string;
  foundViaTopic: string;
  peerKeep: boolean;
  peerReason: string;
}

export interface CreatorDiscoveryResult {
  businessDescription: string;
  routedNiche: string;
  pillarsUsed: CreatorDiscoveryPillar[];
  topicsUsed: CreatorDiscoveryTopic[];
  rankedCreators: CreatorDiscoveryCreatorEntry[];
  droppedCollisions: CreatorDiscoveryCreatorEntry[];
}

export type CreatorDiscoveryProgressUpdate = {
  phase: "routing" | "topics" | "searching" | "collapsed" | "peer_score" | "done";
  topicsTotal?: number;
  topicsSearched?: number;
  reelsKept?: number;
  creatorsFound?: number;
  partial?: CreatorDiscoveryResult;
};

interface InternalScoredHit {
  scored: ScoredReel;
  foundVia: CreatorDiscoveryTopic;
}

interface PeerVerdict {
  username: string;
  keep: boolean;
  reason: string;
}

const PILLAR_TOPIC_SYSTEM = `You are SpyReels' content-pillar engine. A social media coach manually does this: they look at a niche, work out the content PILLARS that actually perform IN THAT SPECIFIC NICHE, then search those topics on Instagram to find the creators already winning with them.

Your job: given a business and how its buyers were mapped, infer the content pillars that genuinely fit THIS niche (not a generic checklist, not always "how-to" teaching), then produce searchable Instagram topic phrases under each pillar.

CRITICAL:
- Pillars are NICHE-SPECIFIC. Detect what fits.
- Topics are NOT always teaching. They can be story, behind-the-scenes, transformation, opinion, trend, showcase, whatever performs.
- Each topic phrase must be something a real Instagram search would return creators for. Short, 2 to 5 words. Plain phrases, NOT hashtags.
- Map to where the BUYER pays attention. For B2B, topics are what the buyer-audience watches.

Return ONLY valid JSON, no preamble, no fences, no em dashes:
{ "pillars": [ { "name": "short pillar name", "why": "one short phrase", "topics": ["phrase","phrase","phrase"] } ] }

RULES:
1. Produce 5 to 7 pillars.
2. Across all pillars, produce ${TOPICS_TARGET} topics total.
3. Topics must be distinct.
4. No hashtags, no "#", no @handles.
5. No em dashes.`;

const PEER_SCORE_SYSTEM = `You are SpyReels' peer-creator filter. We searched Instagram topics for a user's niche and found creators. Some are genuine PEERS in the niche (a creator the user could learn from and remake). Others are KEYWORD COLLISIONS: their reel matched a search word but they are NOT in the niche (e.g. a travel blogger who said "laundry", a website-builder ad showing a laundrette, a generic home-goods reviewer).

For each creator decide: genuine peer in the user's niche/audience space, or keyword collision? Judge from username, display name, the SEARCH TOPIC that surfaced them, and caption. A creator surfaced by a niche-specific search (e.g. "laundromat passive income") whose VIDEO matched that query is very likely a genuine peer even if the caption is just hashtags or empty; when the caption is thin, weight the search topic heavily and lean KEEP. Be strict: if clearly about a DIFFERENT topic and only coincidentally used the word, keep=false.

Return ONLY valid JSON, no preamble, no fences, no em dashes:
{ "verdicts": [ { "username": "exact username", "keep": true, "reason": "short phrase" } ] }
Return a verdict for EVERY username given.`;

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function firstTextBlock(content: Anthropic.Messages.ContentBlock[]): string {
  const block = content.find((x) => x.type === "text");
  return block && block.type === "text" ? block.text : "";
}

export function searchReelToParsedReel(r: SearchReelData): ParsedReel {
  return {
    shortcode: r.shortcode,
    caption: r.caption || "",
    views: r.viewCount,
    likes: r.likeCount,
    comments: r.commentCount,
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    postedAt: r.postedAt,
    owner: {
      username: r.ownerUsername,
      fullName: r.ownerFullName,
      followers: r.ownerFollowerCount,
      isVerified: false,
      isPrivate: false,
      biography: "",
      profilePicUrl: r.ownerProfilePicUrl,
    },
  };
}

function scoreSearchReel(
  r: SearchReelData,
  foundVia: CreatorDiscoveryTopic
): InternalScoredHit | null {
  const scored = scoreReel(searchReelToParsedReel(r));
  if (!scored) return null;
  if (scored.owner.followers < CREATOR_MIN_FOLLOWERS) return null;
  return { scored, foundVia };
}

function collapseToCreators(hits: InternalScoredHit[]): InternalScoredHit[] {
  const best = new Map<string, InternalScoredHit>();
  for (const hit of hits) {
    const key = hit.scored.owner.username.toLowerCase();
    const existing = best.get(key);
    if (!existing || hit.scored.viralScore > existing.scored.viralScore) {
      best.set(key, hit);
    }
  }
  return [...best.values()];
}

function sortHits(hits: InternalScoredHit[]): InternalScoredHit[] {
  return [...hits].sort((a, b) => {
    if (a.scored.tier !== b.scored.tier) return a.scored.tier - b.scored.tier;
    return b.scored.viralScore - a.scored.viralScore;
  });
}

function toCreatorEntry(
  hit: InternalScoredHit,
  peerKeep: boolean,
  peerReason: string,
  rank?: number
): CreatorDiscoveryCreatorEntry {
  const { scored, foundVia } = hit;
  return {
    rank,
    owner: {
      username: scored.owner.username,
      fullName: scored.owner.fullName,
      followers: scored.owner.followers,
      profilePicUrl: scored.owner.profilePicUrl,
    },
    bestReel: {
      shortcode: scored.shortcode,
      reelUrl: scored.reelUrl,
      caption: scored.caption,
      views: scored.views,
      likes: scored.likes,
      comments: scored.comments,
      viralScore: scored.viralScore,
      tier: scored.tier,
      thumbnailUrl: scored.thumbnailUrl,
    },
    foundViaPillar: foundVia.pillar,
    foundViaTopic: foundVia.phrase,
    peerKeep,
    peerReason,
  };
}

function hitsToPrePeerRanked(hits: InternalScoredHit[]): CreatorDiscoveryCreatorEntry[] {
  return sortHits(hits).map((hit, i) =>
    toCreatorEntry(hit, true, "pending peer-score", i + 1)
  );
}

function buildResult(
  businessDescription: string,
  routedNiche: string,
  pillarsUsed: CreatorDiscoveryPillar[],
  topicsUsed: CreatorDiscoveryTopic[],
  rankedCreators: CreatorDiscoveryCreatorEntry[],
  droppedCollisions: CreatorDiscoveryCreatorEntry[]
): CreatorDiscoveryResult {
  return {
    businessDescription,
    routedNiche,
    pillarsUsed,
    topicsUsed,
    rankedCreators,
    droppedCollisions,
  };
}

async function safeProgress(
  onProgress:
    | ((update: CreatorDiscoveryProgressUpdate) => void | Promise<void>)
    | undefined,
  update: CreatorDiscoveryProgressUpdate
): Promise<void> {
  if (!onProgress) return;
  try {
    await onProgress(update);
  } catch {
    // best-effort: progress failures must not break the pipeline
  }
}

async function generatePillarsAndTopics(
  client: Anthropic,
  businessDescription: string,
  niche: string,
  who: string,
  audienceKeywords: string[],
  contentAngles: string[]
): Promise<{ pillarsUsed: CreatorDiscoveryPillar[]; topicsUsed: CreatorDiscoveryTopic[] }> {
  const userMessage = `Business description:
"""
${businessDescription}
"""

Niche: ${niche}
Who they sell to: ${who}
Buyer persona keywords: ${audienceKeywords.join(", ")}
Reel angle hints: ${contentAngles.join("; ") || "(none)"}

Detect this niche's real content pillars and return ${TOPICS_TARGET} searchable topics labeled by pillar. JSON now.`;

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1200,
    temperature: 0.3,
    system: PILLAR_TOPIC_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = stripCodeFences(firstTextBlock(response.content));
  const parsed = JSON.parse(raw) as {
    pillars?: Array<{ name?: string; why?: string; topics?: string[] }>;
  };

  const pillarsUsed: CreatorDiscoveryPillar[] = [];
  const topicsUsed: CreatorDiscoveryTopic[] = [];

  for (const pillar of parsed.pillars ?? []) {
    const name = (pillar.name ?? "Unlabeled").trim();
    const why = pillar.why?.trim() || undefined;
    const topicPhrases: string[] = [];
    for (const phrase of pillar.topics ?? []) {
      const clean = String(phrase).replace(/[#@]/g, "").trim();
      if (!clean) continue;
      topicPhrases.push(clean);
      topicsUsed.push({ pillar: name, phrase: clean });
    }
    pillarsUsed.push({ name, why, topics: topicPhrases });
  }

  return { pillarsUsed, topicsUsed };
}

async function peerScoreBatch(
  client: Anthropic,
  businessDescription: string,
  niche: string,
  who: string,
  batch: InternalScoredHit[]
): Promise<PeerVerdict[]> {
  const lines = batch
    .map((hit) => {
      const caption =
        hit.scored.caption.replace(/\s+/g, " ").trim().slice(0, 200) ||
        "(no caption, judge mainly from the search topic above)";
      return `- username: @${hit.scored.owner.username}
  name: ${hit.scored.owner.fullName || "(unknown)"}
  found via Instagram search: "${hit.foundVia.phrase}" (pillar: ${hit.foundVia.pillar})
  caption: ${caption}`;
    })
    .join("\n\n");

  const userMessage = `User's business:
"""
${businessDescription}
"""
Niche: ${niche}
Buyer: ${who}

Creators to judge:
${lines}

Return a keep/reason verdict for every username.`;

  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      temperature: 0.1,
      system: PEER_SCORE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });
    const parsed = JSON.parse(stripCodeFences(firstTextBlock(response.content))) as {
      verdicts?: PeerVerdict[];
    };
    return parsed.verdicts ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[creatorPipeline] peer-score batch failed (${message}); keeping all`);
    return batch.map((hit) => ({
      username: hit.scored.owner.username,
      keep: true,
      reason: "fail-open",
    }));
  }
}

export async function runCreatorDiscoveryPipeline(
  businessDescription: string,
  onProgress?: (update: CreatorDiscoveryProgressUpdate) => void | Promise<void>
): Promise<CreatorDiscoveryResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const routed = await routeNiche({ businessDescription });
  const routedNiche = routed.primary_niche;
  const whoTheySellTo = routed.audience.who_they_sell_to;

  let pillarsUsed: CreatorDiscoveryPillar[] = [];
  let topicsUsed: CreatorDiscoveryTopic[] = [];

  await safeProgress(onProgress, {
    phase: "routing",
    partial: buildResult(businessDescription, routedNiche, [], [], [], []),
  });

  const generated = await generatePillarsAndTopics(
    anthropic,
    businessDescription,
    routedNiche,
    whoTheySellTo,
    routed.audience.audience_persona_keywords,
    routed.content_angles
  );
  pillarsUsed = generated.pillarsUsed;
  topicsUsed = generated.topicsUsed;

  await safeProgress(onProgress, {
    phase: "topics",
    topicsTotal: topicsUsed.length,
    partial: buildResult(
      businessDescription,
      routedNiche,
      pillarsUsed,
      topicsUsed,
      [],
      []
    ),
  });

  const allHits: InternalScoredHit[] = [];
  let topicsSearched = 0;

  for (const topic of topicsUsed) {
    let results: SearchReelData[] = [];
    try {
      results = await searchReelsByKeyword(topic.phrase, MAX_RESULTS_PER_TOPIC);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[creatorPipeline] keyword "${topic.phrase}" failed: ${message}`);
    }

    for (const raw of results) {
      const hit = scoreSearchReel(raw, topic);
      if (hit) allHits.push(hit);
    }

    topicsSearched++;
    const collapsedSoFar = collapseToCreators(allHits);

    await safeProgress(onProgress, {
      phase: "searching",
      topicsTotal: topicsUsed.length,
      topicsSearched,
      reelsKept: allHits.length,
      creatorsFound: collapsedSoFar.length,
      partial: buildResult(
        businessDescription,
        routedNiche,
        pillarsUsed,
        topicsUsed,
        hitsToPrePeerRanked(collapsedSoFar),
        []
      ),
    });
  }

  const collapsed = collapseToCreators(allHits);

  await safeProgress(onProgress, {
    phase: "collapsed",
    topicsTotal: topicsUsed.length,
    topicsSearched,
    reelsKept: allHits.length,
    creatorsFound: collapsed.length,
    partial: buildResult(
      businessDescription,
      routedNiche,
      pillarsUsed,
      topicsUsed,
      hitsToPrePeerRanked(collapsed),
      []
    ),
  });

  const verdictByUsername = new Map<string, PeerVerdict>();
  for (let i = 0; i < collapsed.length; i += PEER_SCORE_BATCH) {
    const batch = collapsed.slice(i, i + PEER_SCORE_BATCH);
    const verdicts = await peerScoreBatch(
      anthropic,
      businessDescription,
      routedNiche,
      whoTheySellTo,
      batch
    );
    for (const verdict of verdicts) {
      verdictByUsername.set(verdict.username.replace(/^@/, "").toLowerCase(), verdict);
    }
  }

  const keptHits: InternalScoredHit[] = [];
  const droppedHits: InternalScoredHit[] = [];

  for (const hit of collapsed) {
    const key = hit.scored.owner.username.toLowerCase();
    const verdict = verdictByUsername.get(key);
    const keep = verdict ? verdict.keep : true;
    if (keep) {
      keptHits.push(hit);
    } else {
      droppedHits.push(hit);
    }
  }

  const sortedKept = sortHits(keptHits);
  const rankedCreators = sortedKept.map((hit, i) => {
    const key = hit.scored.owner.username.toLowerCase();
    const verdict = verdictByUsername.get(key);
    return toCreatorEntry(
      hit,
      true,
      verdict?.reason ?? "no verdict (kept)",
      i + 1
    );
  });

  const droppedCollisions = droppedHits.map((hit) => {
    const key = hit.scored.owner.username.toLowerCase();
    const verdict = verdictByUsername.get(key);
    return toCreatorEntry(hit, false, verdict?.reason ?? "dropped");
  });

  const finalResult = buildResult(
    businessDescription,
    routedNiche,
    pillarsUsed,
    topicsUsed,
    rankedCreators,
    droppedCollisions
  );

  await safeProgress(onProgress, {
    phase: "peer_score",
    topicsTotal: topicsUsed.length,
    topicsSearched,
    reelsKept: allHits.length,
    creatorsFound: collapsed.length,
    partial: finalResult,
  });

  await safeProgress(onProgress, {
    phase: "done",
    topicsTotal: topicsUsed.length,
    topicsSearched,
    reelsKept: allHits.length,
    creatorsFound: collapsed.length,
    partial: finalResult,
  });

  return finalResult;
}
