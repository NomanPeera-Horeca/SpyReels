export type ContentAgentTurnRole = "user" | "agent";

export type ContentAgentTurnKind =
  | "message"
  | "action_receipt"
  | "work_summary"
  | "error"
  | "clarification";

export type ContentAgentArtifactKind = "reel" | "carousel" | "script" | "none";

export type ContentAgentSourceKind =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "idea"
  | "script"
  | "plan"
  | "none";

export type ContentAgentArtifactContext = {
  kind: ContentAgentArtifactKind;
  id?: number | null;
  title?: string | null;
  duration?: string | null;
  platform?: string | null;
  sourceKind?: ContentAgentSourceKind;
  sourceLabel?: string | null;
};

export type ContentAgentTurn = {
  id: string | number;
  role: ContentAgentTurnRole;
  kind: ContentAgentTurnKind;
  text: string;
  detail?: string | null;
  createdAt?: number | null;
};

export type ContentAgentWorkEventStatus = "pending" | "active" | "completed" | "failed";

export type ContentAgentWorkEvent = {
  id: string;
  label: string;
  status: ContentAgentWorkEventStatus;
  detail?: string | null;
};

export function formatCurrentArtifactContext(
  artifact: ContentAgentArtifactContext | null | undefined
): string | null {
  if (!artifact || artifact.kind === "none") return null;

  const kind =
    artifact.kind === "reel"
      ? "Reel"
      : artifact.kind === "carousel"
        ? "Carousel"
        : "Script";

  const parts = [kind, artifact.title?.trim(), artifact.duration?.trim()].filter(Boolean);
  return parts.join(" · ");
}

export function formatSourceContext(
  artifact: ContentAgentArtifactContext | null | undefined
): string | null {
  if (!artifact) return null;
  if (artifact.sourceLabel?.trim()) return artifact.sourceLabel.trim();

  switch (artifact.sourceKind) {
    case "instagram":
      return "Instagram Reel";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube Short";
    case "plan":
      return "30-day plan";
    case "script":
      return "Pasted script";
    case "idea":
      return "Original idea";
    default:
      return null;
  }
}

export function workSummaryLabel(durationSeconds?: number | null): string {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 1) {
    return "Agent work";
  }
  const seconds = Math.max(1, Math.round(durationSeconds));
  return `Worked for ${seconds}s`;
}

export function actionReceipt(
  id: string | number,
  text: string,
  detail?: string
): ContentAgentTurn {
  return {
    id,
    role: "agent",
    kind: "action_receipt",
    text,
    detail,
    createdAt: Date.now(),
  };
}

export function clarificationTurn(
  id: string | number,
  text: string
): ContentAgentTurn {
  return {
    id,
    role: "agent",
    kind: "clarification",
    text,
    createdAt: Date.now(),
  };
}

export function errorTurn(
  id: string | number,
  text: string,
  detail?: string
): ContentAgentTurn {
  return {
    id,
    role: "agent",
    kind: "error",
    text,
    detail,
    createdAt: Date.now(),
  };
}
