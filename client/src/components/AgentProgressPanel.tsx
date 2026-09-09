import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProgressStep } from "@shared/agentProgress";

type Props = {
  steps: AgentProgressStep[];
  headline?: string;
  subheadline?: string;
  footer?: string;
  badgeLabel?: string;
};

function stepDetail(label: string): string {
  const value = label.toLowerCase();
  if (value.includes("profile")) return "Using your niche and saved creator context";
  if (value.includes("audience") || value.includes("research")) return "Checking useful audience and research signals";
  if (value.includes("direction") || value.includes("angle")) return "Comparing clarity, originality, and fit";
  if (value.includes("writing") || value.includes("script")) return "Building the hook, body, and ending";
  if (value.includes("instruction") || value.includes("constraint")) return "Making sure your instructions are followed";
  if (value.includes("film") || value.includes("production")) return "Adding visual, on-screen text, B-roll, and delivery notes";
  if (value.includes("polish") || value.includes("quality")) return "Checking flow and the final version";
  if (value.includes("understanding") || value.includes("idea")) return "Reading your intent and any hard requirements";
  return "Working on this part of your Reel";
}

export function CoachQuietWait({ title }: { title: string }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-4 py-16 sm:px-0">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Agent is continuing the current Reel.</p>
        </div>
      </div>
    </div>
  );
}

export function AgentProgressPanel({
  steps,
  headline,
  subheadline,
  footer,
}: Props) {
  const activeStep = steps.find((step) => step.status === "active");
  const title = headline ?? activeStep?.label ?? "Agent is creating your Reel";

  return (
    <div className="mx-auto w-full max-w-[620px] px-4 py-14 sm:px-0">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-500">
            <Sparkles className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {subheadline || "Live activity from the work actually being done."}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <span className="text-xs font-semibold text-foreground">Agent activity</span>
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-500">Live</span>
        </div>

        <ol className="space-y-0 px-4 py-2">
          {steps.map((step) => (
            <AgentProgressStepRow key={step.id} step={step} />
          ))}
        </ol>

        {activeStep ? (
          <div className="flex items-center gap-2 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" aria-hidden />
            <span>{stepDetail(activeStep.label)}</span>
          </div>
        ) : null}
      </div>

      {footer ? <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{footer}</p> : null}
    </div>
  );
}

function AgentProgressStepRow({ step }: { step: AgentProgressStep }) {
  return (
    <li className={cn("flex items-start gap-3 py-3", step.status === "pending" && "opacity-45")}>
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
          step.status === "done" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
          step.status === "active" && "border-violet-500/40 bg-violet-500/10 text-violet-500",
          step.status === "pending" && "border-border text-muted-foreground"
        )}
      >
        {step.status === "done" ? (
          <Check className="h-3 w-3" />
        ) : step.status === "active" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span className="h-1 w-1 rounded-full bg-current" />
        )}
      </span>
      <div className="min-w-0">
        <p className={cn("text-sm leading-snug", step.status === "active" ? "font-medium text-foreground" : "text-muted-foreground")}>{step.label}</p>
        {(step.status === "done" || step.status === "active") ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/75">{stepDetail(step.label)}</p> : null}
      </div>
    </li>
  );
}
