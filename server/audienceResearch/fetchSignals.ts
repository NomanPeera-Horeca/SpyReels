import {
  buildRedditSearchQuery,
  looksLikeAudienceQuestion,
  NICHE_SUBREDDITS,
  rankAudienceSignals,
  type AudienceSignalRecord,
  type AudienceSignalSource,
} from "@shared/audienceResearch";
import type { ReelNiche } from "@shared/reelNiches";
import { REEL_NICHE_VALUES } from "@shared/reelNiches";

const REDDIT_USER_AGENT = "SpyReels/1.0 (audience-research; contact: hello@spyreels.ai)";
const FETCH_TIMEOUT_MS = 12_000;

type RedditPost = {
  title?: string;
  selftext?: string;
  permalink?: string;
  url?: string;
  score?: number;
  num_comments?: number;
};

function isReelNiche(slug: string): slug is ReelNiche {
  return (REEL_NICHE_VALUES as readonly string[]).includes(slug);
}

function redditPermalinkUrl(permalink: string): string {
  const path = permalink.startsWith("/") ? permalink : `/${permalink}`;
  return `https://www.reddit.com${path}`;
}

function scoreRedditPost(post: RedditPost): number {
  const upvotes = typeof post.score === "number" ? post.score : 0;
  const comments = typeof post.num_comments === "number" ? post.num_comments : 0;
  return upvotes + comments * 2;
}

function mapRedditPost(post: RedditPost): AudienceSignalRecord | null {
  const title = post.title?.trim();
  if (!title || !looksLikeAudienceQuestion(title)) return null;

  const permalink = post.permalink?.trim();
  const sourceUrl = permalink
    ? redditPermalinkUrl(permalink)
    : post.url?.trim() || null;
  if (!sourceUrl) return null;

  const snippet = post.selftext?.trim().slice(0, 400) || null;

  return {
    source: "reddit",
    title: title.slice(0, 512),
    snippet,
    sourceUrl: sourceUrl.slice(0, 1024),
    score: scoreRedditPost(post),
  };
}

async function fetchJsonWithTimeout(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": REDDIT_USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseRedditListing(json: unknown): AudienceSignalRecord[] {
  const data = json as { data?: { children?: Array<{ data?: RedditPost }> } };
  const children = data?.data?.children ?? [];
  const signals: AudienceSignalRecord[] = [];

  for (const child of children) {
    const mapped = mapRedditPost(child.data ?? {});
    if (mapped) signals.push(mapped);
  }

  return signals;
}

async function fetchRedditSubredditSearch(
  subreddit: string,
  query: string,
  limit = 8
): Promise<AudienceSignalRecord[]> {
  const url = new URL(`https://www.reddit.com/r/${subreddit}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", "top");
  url.searchParams.set("t", "year");
  url.searchParams.set("limit", String(limit));

  const json = await fetchJsonWithTimeout(url.toString());
  if (!json) return [];
  return parseRedditListing(json);
}

async function fetchRedditSubredditHot(
  subreddit: string,
  limit = 15
): Promise<AudienceSignalRecord[]> {
  const url = new URL(`https://www.reddit.com/r/${subreddit}/hot.json`);
  url.searchParams.set("limit", String(limit));

  const json = await fetchJsonWithTimeout(url.toString());
  if (!json) return [];
  return parseRedditListing(json);
}

type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
};

async function fetchSerperSearch(query: string, source: AudienceSignalSource): Promise<AudienceSignalRecord[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const json = (await response.json()) as { organic?: SerperOrganic[] };
    const signals: AudienceSignalRecord[] = [];

    for (const [index, row] of (json.organic ?? []).entries()) {
      const title = row.title?.trim();
      const link = row.link?.trim();
      if (!title || !link) continue;
      if (!looksLikeAudienceQuestion(title) && source !== "web") continue;

      signals.push({
        source,
        title: title.slice(0, 512),
        snippet: row.snippet?.trim().slice(0, 400) ?? null,
        sourceUrl: link.slice(0, 1024),
        score: 100 - index * 5,
      });
    }

    return signals;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAudienceSignalsFromWeb(args: {
  nicheSlug: string;
  nicheLabel: string;
  targetAudience: string;
}): Promise<AudienceSignalRecord[]> {
  const subreddits = isReelNiche(args.nicheSlug)
    ? NICHE_SUBREDDITS[args.nicheSlug]
    : NICHE_SUBREDDITS.business;

  const redditQuery = buildRedditSearchQuery(args.nicheLabel, args.targetAudience);
  const redditTasks: Promise<AudienceSignalRecord[]>[] = [];

  for (const subreddit of subreddits.slice(0, 4)) {
    redditTasks.push(fetchRedditSubredditSearch(subreddit, redditQuery));
    redditTasks.push(fetchRedditSubredditHot(subreddit));
  }

  const serperTasks = [
    fetchSerperSearch(`site:reddit.com ${args.nicheLabel} ${args.targetAudience} question`, "reddit"),
    fetchSerperSearch(`site:quora.com ${args.nicheLabel} ${args.targetAudience}`, "quora"),
    fetchSerperSearch(`${args.nicheLabel} ${args.targetAudience} common questions`, "web"),
  ];

  const settled = await Promise.allSettled([...redditTasks, ...serperTasks]);
  const combined: AudienceSignalRecord[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      combined.push(...result.value);
    }
  }

  return rankAudienceSignals(combined);
}

export type TopicResearchResult = {
  title: string;
  snippet: string | null;
  sourceUrl: string;
  score: number;
};

/**
 * Topic-specific web research for Studio script grounding (Serper + same
 * Reddit/Serper transport as audience signals). Prefer factual/organic hits
 * over audience-question filtering.
 */
export async function fetchTopicResearchFromWeb(args: {
  idea: string;
  nicheLabel: string;
}): Promise<TopicResearchResult[]> {
  const idea = args.idea.replace(/\s+/g, " ").trim().slice(0, 180);
  const niche = args.nicheLabel.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!idea) return [];

  const queries = [
    `${niche} ${idea} statistics facts`.trim(),
    `${idea} ${niche}`.trim(),
    `site:reddit.com ${niche} ${idea}`.trim(),
  ].filter((q) => q.length > 3);

  const settled = await Promise.allSettled(
    queries.map((q) => fetchSerperSearch(q, "web"))
  );

  const byUrl = new Map<string, TopicResearchResult>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const url = row.sourceUrl?.trim();
      if (!url) continue;
      const existing = byUrl.get(url);
      if (existing && existing.score >= row.score) continue;
      byUrl.set(url, {
        title: row.title,
        snippet: row.snippet,
        sourceUrl: url,
        score: row.score,
      });
    }
  }

  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}

