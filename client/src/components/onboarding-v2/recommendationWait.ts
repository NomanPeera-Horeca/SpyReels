/**
 * What the suggestion step shows while a recommendation job is in flight.
 * A failed, unreadable, or expired job leaves the loading line. Saved profile
 * suggestions stay on the form underneath.
 */
import type { AiState } from "./step4";

export type RecommendationStatus = {
  state: "running" | "done" | "failed" | "clarify";
  at?: number;
  question?: string;
};

export function recommendationWaitState(input: {
  requested: boolean;
  status: RecommendationStatus | null;
  seenAt: number | null;
  waitExpired: boolean;
  requestFailed: boolean;
  statusUnreadable: boolean;
}): AiState {
  if (!input.requested) return { state: "idle" };
  if (input.requestFailed) return { state: "failed" };
  const status = input.status;
  const fresh =
    status != null &&
    status.state !== "running" &&
    typeof status.at === "number" &&
    status.at !== input.seenAt;
  if (input.statusUnreadable && !fresh) return { state: "failed" };
  if (input.waitExpired && !fresh) return { state: "failed" };
  if (!status || !fresh) return { state: "running" };
  if (status.state === "failed") return { state: "failed" };
  if (status.state === "clarify" && status.question) {
    return { state: "clarify", question: status.question };
  }
  return { state: "idle" };
}
