import { buildProgressSteps, type AgentProgressStep } from "./agentProgress";

export type DiscoveryProgressStepId =
  | "understand_business"
  | "build_topics"
  | "search_instagram"
  | "score_creators"
  | "filter_peers"
  | "rank_results";

const STEP_ORDER: DiscoveryProgressStepId[] = [
  "understand_business",
  "build_topics",
  "search_instagram",
  "score_creators",
  "filter_peers",
  "rank_results",
];

function defaultDiscoveryStepLabel(stepId: DiscoveryProgressStepId): string {
  switch (stepId) {
    case "understand_business":
      return "Understanding your business and niche";
    case "build_topics":
      return "Building search topics creators rank for";
    case "search_instagram":
      return "Searching Instagram for viral reels in your niche";
    case "score_creators":
      return "Scoring creators by reach and engagement";
    case "filter_peers":
      return "Filtering for genuine peers in your niche";
    case "rank_results":
      return "Ranking your top creators";
    default:
      return "Finding peer creators";
  }
}

export function buildDiscoveryProgressSteps(
  activeStepId: DiscoveryProgressStepId,
  completedThrough?: DiscoveryProgressStepId
): AgentProgressStep[] {
  return buildProgressSteps(
    STEP_ORDER,
    activeStepId,
    completedThrough,
    undefined,
    defaultDiscoveryStepLabel
  );
}

type DiscoveryJobSnapshot = {
  status?: string;
  topicsTotal?: number | null;
  topicsSearched?: number | null;
  creatorsFound?: number | null;
  routedNiche?: string | null;
};

export function discoveryProgressFromJob(args: {
  job: DiscoveryJobSnapshot | undefined;
  isSearchStarting: boolean;
  isPrePeer: boolean;
  hasResults: boolean;
}): AgentProgressStep[] {
  const { job, isSearchStarting, isPrePeer, hasResults } = args;
  const topicsTotal = job?.topicsTotal ?? 0;
  const topicsSearched = job?.topicsSearched ?? 0;

  if (hasResults && !isSearchStarting) {
    return buildDiscoveryProgressSteps("rank_results", "rank_results");
  }

  if (isSearchStarting && !job) {
    return buildDiscoveryProgressSteps("understand_business");
  }

  if (!job || job.status === "pending") {
    return buildDiscoveryProgressSteps("understand_business");
  }

  if (topicsTotal === 0) {
    return buildDiscoveryProgressSteps("build_topics", "understand_business");
  }

  if (topicsSearched < topicsTotal) {
    const label =
      topicsTotal > 0
        ? `Searching Instagram topics (${topicsSearched}/${topicsTotal})`
        : defaultDiscoveryStepLabel("search_instagram");
    return buildDiscoveryProgressSteps("search_instagram", "build_topics").map((step) =>
      step.id === "search_instagram" ? { ...step, label } : step
    );
  }

  if (isPrePeer) {
    return buildDiscoveryProgressSteps("filter_peers", "score_creators");
  }

  if ((job.creatorsFound ?? 0) > 0) {
    return buildDiscoveryProgressSteps("rank_results", "filter_peers");
  }

  return buildDiscoveryProgressSteps("score_creators", "search_instagram");
}

export const DISCOVERY_AGENT_FOOTER =
  "This usually takes 5 to 10 minutes. Creators appear as we find them.";
