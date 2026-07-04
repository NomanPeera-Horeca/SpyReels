import { useEffect, useRef, useState } from "react";
import type { AgentProgressStep } from "@shared/agentProgress";

export function useAgentProgressPoll(args: {
  enabled: boolean;
  initialSteps: AgentProgressStep[];
  fetchProgress: () => Promise<{ steps: AgentProgressStep[] } | null | undefined>;
  intervalMs?: number;
}): AgentProgressStep[] {
  const { enabled, initialSteps, fetchProgress, intervalMs = 800 } = args;
  const [steps, setSteps] = useState(initialSteps);
  const timerRef = useRef<number | null>(null);
  const initialStepsRef = useRef(initialSteps);
  initialStepsRef.current = initialSteps;

  useEffect(() => {
    if (!enabled) {
      setSteps(initialStepsRef.current);
      return;
    }

    setSteps(initialStepsRef.current);

    const pull = () => {
      void fetchProgress()
        .then((progress) => {
          if (progress?.steps?.length) setSteps(progress.steps);
        })
        .catch(() => undefined);
    };

    pull();
    timerRef.current = window.setInterval(pull, intervalMs);

    return () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, fetchProgress, intervalMs]);

  return steps;
}
