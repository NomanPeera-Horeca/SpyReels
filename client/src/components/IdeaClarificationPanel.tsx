import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, MessageCircleQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  labelForWizardAnswer,
  resolveWizardSteps,
  type ClarificationStep,
  type IdeaClarificationWizard,
} from "@shared/ideaClarification";

type Props = {
  open: boolean;
  ideaPreview: string;
  wizard: IdeaClarificationWizard;
  isSubmitting?: boolean;
  onClose: () => void;
  onSkip: () => void;
  onComplete: (answers: Record<string, string>, customNotes: string) => void;
};

export function IdeaClarificationPanel({
  open,
  ideaPreview,
  wizard,
  isSubmitting,
  onClose,
  onSkip,
  onComplete,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customText, setCustomText] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const activeSteps = useMemo(
    () => resolveWizardSteps(wizard, answers),
    [wizard, answers]
  );

  const step: ClarificationStep | undefined = activeSteps[stepIndex];
  const totalSteps = activeSteps.length;

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setAnswers({});
    setCustomText("");
    setShowCustom(false);
  }, [open, wizard]);

  useEffect(() => {
    if (stepIndex >= activeSteps.length && activeSteps.length > 0) {
      setStepIndex(activeSteps.length - 1);
    }
  }, [stepIndex, activeSteps.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !step) return null;

  const selectedId = answers[step.id];
  const isLastStep = stepIndex >= totalSteps - 1;

  const answeredChips = activeSteps
    .slice(0, stepIndex)
    .map((s) => {
      const raw = answers[s.id];
      if (!raw) return null;
      return { question: s.question, answer: labelForWizardAnswer(s, raw) };
    })
    .filter(Boolean) as Array<{ question: string; answer: string }>;

  const pickOption = (optionId: string) => {
    setShowCustom(false);
    setAnswers((prev) => ({ ...prev, [step.id]: optionId }));
  };

  const goNext = () => {
    if (!selectedId && !showCustom) return;
    const stepAnswer = showCustom && customText.trim() ? customText.trim() : selectedId;
    if (!stepAnswer) return;

    const nextAnswers = { ...answers, [step.id]: stepAnswer };
    setAnswers(nextAnswers);

    const nextActive = resolveWizardSteps(wizard, nextAnswers);
    const nextIndex = stepIndex + 1;

    if (nextIndex >= nextActive.length) {
      onComplete(nextAnswers, "");
      return;
    }

    setStepIndex(nextIndex);
    setShowCustom(false);
    setCustomText("");
  };

  const goBack = () => {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
    setShowCustom(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end font-sans">
      <button
        type="button"
        aria-label="Close clarification"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-auto w-full max-w-2xl animate-in slide-in-from-bottom-4 duration-300"
      >
        <div className="mx-3 mb-3 rounded-2xl border border-violet-500/25 bg-card shadow-2xl shadow-violet-950/40 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4 bg-gradient-to-r from-violet-500/10 to-purple-500/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
                <MessageCircleQuestion className="h-5 w-5 text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Before we write your script</p>
                <p className="text-xs text-muted-foreground truncate max-w-[280px] sm:max-w-md">
                  {ideaPreview}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums">
                {stepIndex + 1} of {totalSteps}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {answeredChips.length > 0 ? (
            <div className="px-5 pt-4 flex flex-wrap gap-1.5">
              {answeredChips.map((chip) => (
                <span
                  key={chip.question}
                  className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-200"
                  title={chip.question}
                >
                  {chip.answer}
                </span>
              ))}
            </div>
          ) : null}

          <div className="px-5 pt-5 pb-2">
            <h2 className="text-lg font-semibold text-foreground leading-snug">{step.question}</h2>
          </div>

          <div className="px-3 pb-3 space-y-1.5 max-h-[min(50vh,320px)] overflow-y-auto">
            {step.options.map((opt, idx) => {
              const active = selectedId === opt.id && !showCustom;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => pickOption(opt.id)}
                  className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                    active
                      ? "border-violet-500 bg-violet-500/15 ring-1 ring-violet-500/40"
                      : "border-border/60 bg-background/40 hover:border-violet-500/40 hover:bg-violet-500/5"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                      active ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                    {opt.sub ? (
                      <span className="block text-xs text-muted-foreground mt-0.5">{opt.sub}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            {step.allowCustom ? (
              <div className="pt-1">
                {!showCustom ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setShowCustom(true);
                      setAnswers((prev) => {
                        const next = { ...prev };
                        delete next[step.id];
                        return next;
                      });
                    }}
                    className="w-full flex items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-3 text-left text-sm text-muted-foreground hover:border-violet-500/40 hover:text-foreground transition-colors"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs">
                      +
                    </span>
                    Something else
                  </button>
                ) : (
                  <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-3">
                    <input
                      type="text"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Type your answer..."
                      autoFocus
                      className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500/50 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/50 px-5 py-4 bg-muted/20">
            <div className="flex items-center gap-2">
              {stepIndex > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={goBack}
                  className="h-9 gap-1 text-muted-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={onSkip}
                  className="h-9 text-muted-foreground"
                >
                  Skip
                </Button>
              )}
            </div>

            <Button
              type="button"
              size="sm"
              disabled={isSubmitting || (!selectedId && !(showCustom && customText.trim()))}
              onClick={goNext}
              className="h-9 min-w-[120px] bg-violet-600 hover:bg-violet-700 text-white gap-1"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLastStep ? (
                "Generate Script"
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/80 pb-1 px-4">
          Or reply by editing your idea above after closing this panel
        </p>
      </div>
    </div>
  );
}
