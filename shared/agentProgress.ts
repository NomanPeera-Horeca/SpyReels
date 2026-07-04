export type AgentProgressStepStatus = "pending" | "active" | "done";

export type AgentProgressStep = {
  id: string;
  label: string;
  status: AgentProgressStepStatus;
};

export function buildProgressSteps<T extends string>(
  stepOrder: readonly T[],
  activeStepId: T,
  completedThrough?: T,
  labels?: Partial<Record<T, string>>,
  defaultLabel?: (id: T) => string
): AgentProgressStep[] {
  const completedIndex =
    completedThrough != null
      ? stepOrder.indexOf(completedThrough)
      : stepOrder.indexOf(activeStepId) - 1;

  return stepOrder.map((id, index) => {
    let status: AgentProgressStepStatus = "pending";
    if (index <= completedIndex) status = "done";
    else if (id === activeStepId) status = "active";
    return {
      id,
      label: labels?.[id] ?? defaultLabel?.(id) ?? id,
      status,
    };
  });
}
