import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProgressStep } from "@shared/agentProgress";

type Props = {
  steps: AgentProgressStep[];
  headline?: string;
  subheadline?: string;
  footer?: string;
  badgeLabel?: string;
};

export function AgentProgressPanel({
  steps,
  headline,
  subheadline,
  footer,
  badgeLabel = "Working",
}: Props) {
  const activeStep = steps.find((step) => step.status === "active");
  const doneCount = steps.filter((step) => step.status === "done").length;
  const title =
    headline ??
    activeStep?.label ??
    steps[steps.length - 1]?.label ??
    "Working on your script";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-0">
      <p className="mb-6 text-center text-xs text-muted-foreground">{badgeLabel}</p>

      <div className="mb-10 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h2>
        {subheadline ? (
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{subheadline}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {doneCount > 0
              ? `${doneCount} of ${steps.length} steps complete. Usually 1-2 minutes.`
              : "Usually 1-2 minutes."}
          </p>
        )}
      </div>

      <ol className="space-y-3.5">
        {steps.map((step) => (
          <AgentProgressStepRow key={step.id} step={step} />
        ))}
      </ol>

      {footer ? (
        <p className="mt-8 text-center text-sm text-muted-foreground leading-relaxed">{footer}</p>
      ) : null}
    </div>
  );
}

function AgentProgressStepRow({ step }: { step: AgentProgressStep }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          step.status === "done" && "text-muted-foreground",
          step.status === "active" && "text-violet-600 dark:text-violet-400",
          step.status === "pending" && "text-muted-foreground/40"
        )}
      >
        {step.status === "done" ? (
          <Check className="h-3.5 w-3.5" />
        ) : step.status === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <span className="h-1 w-1 rounded-full bg-muted-foreground/35" />
        )}
      </span>
      <span
        className={cn(
          "pt-0.5 text-sm leading-snug",
          step.status === "done" && "text-muted-foreground",
          step.status === "active" && "font-medium text-foreground",
          step.status === "pending" && "text-muted-foreground/55"
        )}
      >
        {step.label}
      </span>
    </li>
  );
}
