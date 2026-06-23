export type IdeaScriptProgressStepId =
  | "read_idea"
  | "match_profile"
  | "score_idea"
  | "find_viral_hooks"
  | "build_structure"
  | "write_script"
  | "polish_hook"
  | "finalize";

export type IdeaScriptProgressStepStatus = "pending" | "active" | "done";

export type IdeaScriptProgressStep = {
  id: IdeaScriptProgressStepId;
  label: string;
  status: IdeaScriptProgressStepStatus;
  at?: string;
};

const STEP_LABELS: Record<IdeaScriptProgressStepId, string> = {
  read_idea: "Read your idea",
  match_profile: "Matched your niche and audience",
  score_idea: "Checked hook potential",
  find_viral_hooks: "Pulled viral hooks from your niche",
  build_structure: "Built your H.E.I.T. outline",
  write_script: "Writing your script",
  polish_hook: "Sharpening the opening hook",
  finalize: "Finalizing your script",
};

const VALIDATION_FLOW: IdeaScriptProgressStepId[] = [
  "read_idea",
  "match_profile",
  "score_idea",
];

const PROCESSING_FLOW: IdeaScriptProgressStepId[] = [
  "find_viral_hooks",
  "build_structure",
  "write_script",
  "polish_hook",
  "finalize",
];

export function ideaScriptProgressLabel(stepId: IdeaScriptProgressStepId): string {
  return STEP_LABELS[stepId];
}

export function buildIdeaScriptProgressSteps(
  flow: "validation" | "processing",
  activeStepId: IdeaScriptProgressStepId,
  completedThrough?: IdeaScriptProgressStepId
): IdeaScriptProgressStep[] {
  const ids = flow === "validation" ? VALIDATION_FLOW : PROCESSING_FLOW;
  const completedIndex =
    completedThrough != null ? ids.indexOf(completedThrough) : ids.indexOf(activeStepId) - 1;

  return ids.map((id, index) => {
    let status: IdeaScriptProgressStepStatus = "pending";
    if (index <= completedIndex) status = "done";
    else if (id === activeStepId) status = "active";
    return {
      id,
      label: STEP_LABELS[id],
      status,
    };
  });
}

export function readIdeaScriptProgress(viralStructure: unknown): IdeaScriptProgressStep[] {
  if (!viralStructure || typeof viralStructure !== "object" || Array.isArray(viralStructure)) {
    return [];
  }
  const meta = (viralStructure as Record<string, unknown>).ideaMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = (meta as Record<string, unknown>).progressSteps;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): IdeaScriptProgressStep | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const id = row.id;
      const label = row.label;
      const status = row.status;
      if (typeof id !== "string" || !(id in STEP_LABELS)) return null;
      if (typeof label !== "string" || !label.trim()) return null;
      if (status !== "pending" && status !== "active" && status !== "done") return null;
      return {
        id: id as IdeaScriptProgressStepId,
        label: label.trim(),
        status,
        ...(typeof row.at === "string" ? { at: row.at } : {}),
      };
    })
    .filter((step): step is IdeaScriptProgressStep => step != null);
}

export function fallbackProgressForStatus(
  status: "queued" | "validating" | "processing"
): IdeaScriptProgressStep[] {
  if (status === "processing") {
    return buildIdeaScriptProgressSteps("processing", "write_script");
  }
  return buildIdeaScriptProgressSteps("validation", "score_idea");
}
