import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_STEPS, type PipelineProgressStep } from "../types";

export function GenerateProgress({
  activeStep,
  done,
}: {
  activeStep: PipelineProgressStep | null;
  done: boolean;
}) {
  if (!activeStep && !done) return null;

  const activeIndex = activeStep
    ? PIPELINE_STEPS.findIndex((s) => s.id === activeStep)
    : PIPELINE_STEPS.length;

  return (
    <div className="rounded-2xl border border-violet-200/80 bg-violet-50/80 p-4 dark:border-violet-900/50 dark:bg-violet-950/30">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        {done ? "Ready" : "Working"}
      </p>
      <ul className="space-y-2">
        {PIPELINE_STEPS.map((step, i) => {
          const isDone = done || i < activeIndex;
          const isActive = !done && i === activeIndex;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-2 text-sm transition",
                isDone || isActive
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400"
              )}
            >
              {isDone ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-zinc-300 dark:border-zinc-600" />
              )}
              {step.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
