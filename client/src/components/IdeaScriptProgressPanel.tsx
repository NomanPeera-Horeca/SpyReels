import { useMemo } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import {
  fallbackProgressForStatus,
  readIdeaScriptProgress,
  type IdeaScriptProgressStep,
} from "@shared/ideaScriptProgress";
import { cn } from "@/lib/utils";

type Props = {
  status: "queued" | "validating" | "processing";
  viralStructure?: unknown;
  defaultOpen?: boolean;
};

export function IdeaScriptProgressPanel({ status, viralStructure, defaultOpen = true }: Props) {
  const steps = useMemo(() => {
    const stored = readIdeaScriptProgress(viralStructure);
    if (stored.length > 0) return stored;
    return fallbackProgressForStatus(status);
  }, [status, viralStructure]);

  const doneCount = steps.filter((step) => step.status === "done").length;
  const activeStep = steps.find((step) => step.status === "active");
  const headline = activeStep?.label ?? steps[steps.length - 1]?.label ?? "Working on your script";

  return (
    <div className="w-full max-w-md">
      <details open={defaultOpen} className="group">
        <summary className="list-none cursor-pointer select-none">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            <span>{headline}</span>
            <span className="text-xs text-muted-foreground/70">
              {doneCount > 0 ? `Completed ${doneCount} step${doneCount === 1 ? "" : "s"}` : "In progress"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70 transition-transform group-open:rotate-180" />
          </div>
        </summary>
        <ol className="mt-3 space-y-2 border-l border-border/60 pl-4">
          {steps.map((step) => (
            <ProgressStepRow key={step.id} step={step} />
          ))}
        </ol>
      </details>
    </div>
  );
}

function ProgressStepRow({ step }: { step: IdeaScriptProgressStep }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {step.status === "done" ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : step.status === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
        )}
      </span>
      <span
        className={cn(
          "leading-snug",
          step.status === "done" && "text-muted-foreground",
          step.status === "active" && "text-foreground font-medium",
          step.status === "pending" && "text-muted-foreground/60"
        )}
      >
        {step.label}
      </span>
    </li>
  );
}
