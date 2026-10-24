/**
 * What the suggestion step shows while a recommendation job is in flight.
 * An empty status is not a running job. Saved suggestions stay on the form
 * while a later evidence key is still open.
 */
import type { AiState } from "./step4";

export type RecommendationStatus = {
  state: "running" | "done" | "failed" | "clarify";
  at?: number;
  question?: string;
};

const DISPLAY_KINDS = {
  goal: ["goal", "niche", "language"],
  audience: ["audience"],
  pillars: ["pillar"],
} as const;

export function stepHasDisplaySuggestions(
  step: keyof typeof DISPLAY_KINDS | null,
  items: readonly { kind: string }[]
): boolean {
  if (!step) return false;
  const kinds: readonly string[] = DISPLAY_KINDS[step];
  return items.some(item => kinds.includes(item.kind));
}

/**
 * True only after this step's suggestions are in the document.
 * Items sitting in the API response do not count.
 */
export function suggestionVisibleReady(input: {
  step: keyof typeof DISPLAY_KINDS | null;
  items: readonly { kind: string }[];
  painted: boolean;
}): boolean {
  return input.painted && stepHasDisplaySuggestions(input.step, input.items);
}

export function recommendationWaitState(input: {
  requested: boolean;
  status: RecommendationStatus | null;
  seenAt: number | null;
  waitExpired: boolean;
  requestFailed: boolean;
  statusUnreadable: boolean;
  hasSavedSuggestions: boolean;
}): AiState {
  if (!input.requested) return { state: "idle" };
  if (input.requestFailed && !input.hasSavedSuggestions) return { state: "failed" };
  const status = input.status;
  if (input.statusUnreadable && !status && !input.hasSavedSuggestions) return { state: "failed" };
  if (!status) {
    if (input.waitExpired && !input.hasSavedSuggestions) return { state: "failed" };
    return { state: "idle" };
  }
  if (status.state === "running") {
    if (input.hasSavedSuggestions) return { state: "idle" };
    if (input.waitExpired) return { state: "failed" };
    return { state: "running" };
  }
  if (status.state === "failed") return { state: "failed" };
  if (status.state === "clarify" && status.question) {
    return { state: "clarify", question: status.question };
  }
  return { state: "idle" };
}
