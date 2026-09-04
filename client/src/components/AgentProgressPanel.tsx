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
      <div className="mb-6 flex items-center justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {badgeLabel}
        </span>
      </div>

      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
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

      <div className="rounded-xl border border-border/50 bg-card p-5">
        <ol className="space-y-3">
          {steps.map((step) => (
            <AgentProgressStepRow key={step.id} step={step} />
          ))}
        </ol>
      </div>

      {footer ? (
        <p className="mt-5 text-center text-xs text-muted-foreground leading-relaxed">{footer}</p>
      ) : null}
    </div>
  );
}

function AgentProgressStepRow({ step }: { step: AgentProgressStep }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
          step.status === "done" && "bg-emerald-500/15 text-emerald-500",
          step.status === "active" && "bg-primary/15 text-primary",
          step.status === "pending" && "bg-muted text-muted-foreground"
        )}
      >
        {step.status === "done" ? (
          <Check className="h-3.5 w-3.5" />
        ) : step.status === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        )}
      </span>
      <span
        className={cn(
          "text-sm leading-snug pt-1",
          step.status === "done" && "text-muted-foreground",
          step.status === "active" && "font-medium text-foreground",
          step.status === "pending" && "text-muted-foreground/60"
        )}
      >
        {step.label}
      </span>
    </li>
  );
}
