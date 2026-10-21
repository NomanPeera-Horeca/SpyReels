/**
 * Evidence-backed performance patterns from a creator's own public posts.
 *
 * Metrics are calculated here. Labels (format, topic) may be supplied by a
 * classifier, but this module never invents views, likes, comments, or watch time.
 * A comparison is emitted only when both sides have enough aged posts and the
 * baseline is greater than zero.
 */

export const MIN_COMPARISON_GROUP = 3;
export const MIN_COMPARISON_BASELINE = 3;
export const MIN_POST_AGE_MS = 2 * 24 * 60 * 60 * 1000;
/** Ignore lifts smaller than 15%. A tiny gap is not a pattern worth stating. */
export const MIN_LIFT_RATIO = 1.15;

export type InsightPost = {
  postId: string;
  url: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
  caption: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  formatLabel?: string | null;
  topicLabel?: string | null;
};

export type InsightMetric = "views" | "engagement_rate";

export type InsightComparison = {
  metric: InsightMetric;
  groupLabel: string;
  groupCount: number;
  groupValue: number;
  baselineLabel: string;
  baselineCount: number;
  baselineValue: number;
  /** How the two numbers were produced. */
  definition: string;
};

export type PanelInsight = {
  postId: string;
  url: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  /** Provider view count for this video. Null when the provider did not return one. */
  views: number | null;
  headline: string;
  support: string;
  /** Comparison figure such as "2.4x" or "60%". Null for a qualitative card. */
  figure: string | null;
  confidence: "eligible" | "qualitative";
  comparison: InsightComparison | null;
};

export type PerformancePanels = {
  goal: PanelInsight | null;
  audience: PanelInsight | null;
  pillars: PanelInsight | null;
};

type Kind = "opening" | "duration" | "format" | "topic";

type Candidate = {
  kind: Kind;
  metric: InsightMetric;
  phrase: string;
  postId: string;
  members: InsightPost[];
  ratio: number;
  figure: string;
  headline: string;
  support: string;
  comparison: InsightComparison;
  video: InsightPost;
};

const FORMAT_PHRASE: Record<string, string> = {
  talking_head: "filmed as talking head",
  voiceover: "using voiceover",
  product_demo: "demonstrating a product",
  behind_the_scenes: "showing behind the scenes",
  text_on_screen: "led by on-screen text",
};

const DURATION_PHRASE: Record<string, string> = {
  under_15s: "shorter than 15 seconds",
  mid: "between 15 and 45 seconds",
  over_45s: "longer than 45 seconds",
};

const QUESTION_START =
  /^(who|what|why|how|when|where|did|do|does|is|are|can|should|would)\b/i;

function viewsOf(post: InsightPost): number | null {
  return typeof post.views === "number" && Number.isFinite(post.views) && post.views > 0
    ? post.views
    : null;
}

/**
 * A count is usable only when the provider returned a real positive number.
 * Null is missing. Zero is not usable either: the scrapers coerce a missing
 * count to 0, so a 0 is not proof that the video had no likes or comments.
 */
function reliableCount(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function engagementOf(post: InsightPost): number | null {
  const views = viewsOf(post);
  if (views === null) return null;
  const likes = reliableCount(post.likes);
  const comments = reliableCount(post.comments);
  // Both counts are required. A missing side is not filled in as zero.
  if (likes === null || comments === null) return null;
  return (likes + comments) / views;
}

function aged(post: InsightPost, now: number): boolean {
  if (!post.publishedAt) return false;
  const t = Date.parse(post.publishedAt);
  if (!Number.isFinite(t)) return false;
  return now - t >= MIN_POST_AGE_MS;
}

function mean(values: number[]): number {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function formatMultiple(ratio: number): string {
  const rounded = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}x`;
}

function isQuestion(caption: string | null): boolean {
  const head = (caption ?? "").trim().slice(0, 80);
  if (!head) return false;
  return head.includes("?") || QUESTION_START.test(head);
}

function durationBucket(sec: number | null): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 15) return "under_15s";
  if (sec <= 45) return "mid";
  return "over_45s";
}

function topicPhrase(label: string | null | undefined): string | null {
  const text = (label ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 40) return null;
  if (/\d|%|views|viral|watch/i.test(text)) return null;
  const words = text.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 4) return null;
  return `about ${text.toLowerCase()}`;
}

function compareGroup(input: {
  posts: InsightPost[];
  now: number;
  kind: Kind;
  phrase: string;
  member: (post: InsightPost) => boolean;
  metric: InsightMetric;
}): Candidate | null {
  const eligible = input.posts.filter(p => aged(p, input.now));
  const valueOf = input.metric === "views" ? viewsOf : engagementOf;
  const scored = eligible
    .map(post => ({ post, value: valueOf(post) }))
    .filter((row): row is { post: InsightPost; value: number } => row.value !== null);
  const group = scored.filter(row => input.member(row.post));
  const baseline = scored.filter(row => !input.member(row.post));
  if (group.length < MIN_COMPARISON_GROUP || baseline.length < MIN_COMPARISON_BASELINE) {
    return null;
  }
  const groupValue = mean(group.map(row => row.value));
  const baselineValue = mean(baseline.map(row => row.value));
  if (!(baselineValue > 0) || !(groupValue > 0)) return null;
  const ratio = groupValue / baselineValue;
  if (ratio < MIN_LIFT_RATIO) return null;

  const figure =
    input.metric === "views"
      ? formatMultiple(ratio)
      : `${Math.round((ratio - 1) * 100)}%`;
  const headline =
    input.metric === "views"
      ? `Videos ${input.phrase} average ${figure} more views.`
      : `Videos ${input.phrase} average ${figure} higher engagement.`;
  const definition =
    input.metric === "views"
      ? "Mean views of the group divided by mean views of the other videos. Views come from the provider. Posts younger than 2 days are left out."
      : "Mean (likes + comments) / views. A post is included only when views, likes, and comments are all present and greater than zero. This is not watch time.";
  const members = [...group]
    .sort((a, b) => b.value - a.value)
    .map(row => row.post);
  const video = members[0]!;
  const support =
    input.metric === "views"
      ? `Group average across ${group.length} videos, compared with ${baseline.length} others. The view count is this video only.`
      : `Group average across ${group.length} videos, compared with ${baseline.length} others. This percentage is not this video's own engagement. The view count is this video only.`;
  return {
    kind: input.kind,
    metric: input.metric,
    phrase: input.phrase,
    postId: video.postId,
    members,
    ratio,
    figure,
    headline,
    support,
    video,
    comparison: {
      metric: input.metric,
      groupLabel: input.phrase,
      groupCount: group.length,
      groupValue,
      baselineLabel: "other videos",
      baselineCount: baseline.length,
      baselineValue,
      definition,
    },
  };
}

function toPanel(candidate: Candidate, post: InsightPost): PanelInsight {
  return {
    postId: post.postId,
    url: post.url,
    thumbnailUrl: post.thumbnailUrl ?? null,
    videoUrl: post.videoUrl ?? null,
    views: viewsOf(post),
    headline: candidate.headline,
    support: candidate.support,
    figure: candidate.figure,
    confidence: "eligible",
    comparison: candidate.comparison,
  };
}

function qualitative(post: InsightPost | undefined): PanelInsight | null {
  if (!post) return null;
  return {
    postId: post.postId,
    url: post.url,
    thumbnailUrl: post.thumbnailUrl ?? null,
    videoUrl: post.videoUrl ?? null,
    views: viewsOf(post),
    headline: "One of your public videos",
    support: "There are not enough similar videos with view counts to compare a pattern yet.",
    figure: null,
    confidence: "qualitative",
    comparison: null,
  };
}

function collect(posts: InsightPost[], now: number): Candidate[] {
  const out: Candidate[] = [];
  const push = (candidate: Candidate | null) => {
    if (candidate) out.push(candidate);
  };
  for (const metric of ["views", "engagement_rate"] as const) {
    push(
      compareGroup({
        posts,
        now,
        kind: "opening",
        phrase: "starting with a question",
        metric,
        member: post => isQuestion(post.caption),
      })
    );
    for (const [bucket, phrase] of Object.entries(DURATION_PHRASE)) {
      push(
        compareGroup({
          posts,
          now,
          kind: "duration",
          phrase,
          metric,
          member: post => durationBucket(post.durationSec) === bucket,
        })
      );
    }
    for (const [label, phrase] of Object.entries(FORMAT_PHRASE)) {
      push(
        compareGroup({
          posts,
          now,
          kind: "format",
          phrase,
          metric,
          member: post => post.formatLabel === label,
        })
      );
    }
    const topics = new Set(
      posts.map(post => topicPhrase(post.topicLabel)).filter((p): p is string => Boolean(p))
    );
    for (const phrase of topics) {
      push(
        compareGroup({
          posts,
          now,
          kind: "topic",
          phrase,
          metric,
          member: post => topicPhrase(post.topicLabel) === phrase,
        })
      );
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

function pick(
  candidates: Candidate[],
  used: Set<string>,
  accept: (candidate: Candidate) => boolean
): { candidate: Candidate; post: InsightPost } | null {
  for (const candidate of candidates) {
    if (!accept(candidate)) continue;
    const post = candidate.members.find(member => !used.has(member.postId));
    if (post) return { candidate, post };
  }
  return null;
}

/**
 * One card per onboarding screen. Screens prefer different videos when more
 * than one eligible post exists. Missing evidence stays qualitative: no figure.
 */
export function buildPerformancePanels(posts: InsightPost[], now: Date): PerformancePanels {
  const candidates = collect(posts, now.getTime());
  const byViews = [...posts]
    .filter(post => viewsOf(post) !== null)
    .sort((a, b) => (viewsOf(b) ?? 0) - (viewsOf(a) ?? 0));
  const used = new Set<string>();

  const goalPick = pick(
    candidates,
    used,
    candidate =>
      candidate.metric === "views" &&
      (candidate.kind === "opening" || candidate.kind === "format" || candidate.kind === "duration")
  );
  if (goalPick) used.add(goalPick.post.postId);

  const audiencePick = pick(
    candidates,
    used,
    candidate =>
      candidate.metric === "engagement_rate" ||
      candidate.kind === "opening" ||
      candidate.kind === "topic"
  );
  if (audiencePick) used.add(audiencePick.post.postId);

  const pillarPick = pick(
    candidates,
    used,
    candidate => candidate.kind === "topic" || candidate.kind === "format"
  );

  const unusedPost = (taken: Set<string>) => byViews.find(post => !taken.has(post.postId));

  const goal = goalPick
    ? toPanel(goalPick.candidate, goalPick.post)
    : qualitative(byViews[0] ?? posts[0]);
  if (goal) used.add(goal.postId);

  const audience = audiencePick
    ? toPanel(audiencePick.candidate, audiencePick.post)
    : qualitative(unusedPost(used) ?? byViews[0] ?? posts[0]);
  if (audience) used.add(audience.postId);

  const pillars = pillarPick
    ? toPanel(pillarPick.candidate, pillarPick.post)
    : qualitative(unusedPost(used) ?? byViews[0] ?? posts[0]);

  return { goal, audience, pillars };
}
