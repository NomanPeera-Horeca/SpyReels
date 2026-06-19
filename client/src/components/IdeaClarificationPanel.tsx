import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  labelForWizardAnswer,
  resolveWizardSteps,
  wizardStepCount,
  type ClarificationStep,
  type IdeaClarificationWizard,
} from "@shared/ideaClarification";

type Props = {
  open: boolean;
  ideaId: number;
  ideaPreview: string;
  wizard: IdeaClarificationWizard;
  isSubmitting?: boolean;
  onClose: () => void;
  onSkip: () => void;
  onComplete: (answers: Record<string, string>, customNotes: string) => void;
};

export function IdeaClarificationPanel({
  open,
  ideaId,
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
  const wasOpenRef = useRef(false);
  const lastIdeaIdRef = useRef<number | null>(null);

  const activeSteps = useMemo(
    () => resolveWizardSteps(wizard, answers),
    [wizard, answers]
  );

  const step: ClarificationStep | undefined = activeSteps[stepIndex];
  const totalSteps = wizardStepCount(wizard, answers);
  const progressPct = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0;

  useEffect(() => {
    const opening = open && !wasOpenRef.current;
    const ideaChanged = open && lastIdeaIdRef.current !== ideaId;
    wasOpenRef.current = open;
    lastIdeaIdRef.current = open ? ideaId : lastIdeaIdRef.current;

    if (opening || ideaChanged) {
      setStepIndex(0);
      setAnswers({});
      setCustomText("");
      setShowCustom(false);
    }
  }, [open, ideaId]);

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
  const isLastStep = stepIndex >= activeSteps.length - 1;

  const answeredChips = activeSteps
    .slice(0, stepIndex)
    .map((s) => {
      const raw = answers[s.id];
      if (!raw) return null;
      return { question: s.question, answer: labelForWizardAnswer(s, raw) };
    })
    .filter(Boolean) as Array<{ question: string; answer: string }>;

  const advanceWithAnswer = (stepAnswer: string) => {
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

  const pickOption = (optionId: string) => {
    if (isSubmitting) return;
    setShowCustom(false);
    advanceWithAnswer(optionId);
  };

  const submitCustom = () => {
    const trimmed = customText.trim();
    if (!trimmed || isSubmitting) return;
    advanceWithAnswer(trimmed);
  };

  const goBack = () => {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
    setShowCustom(false);
  };

  const shortPreview =
    ideaPreview.length > 72 ? `${ideaPreview.slice(0, 72).trim()}...` : ideaPreview;

  return (
    <div className="fixed inset-0 z-[100] font-sans">
      <button
        type="button"
        aria-label="Close clarification"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col animate-in slide-in-from-bottom-full duration-300 ease-out"
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-t-[20px] border-t border-white/10 bg-[#1c1c1e] shadow-[0_-24px_80px_rgba(0,0,0,0.55)]">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20" aria-hidden />

          <div className="h-1 shrink-0 bg-white/5">
            <div
              className="h-full bg-violet-500 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 pb-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
                Quick question {stepIndex + 1} of {totalSteps}
              </p>
              <p className="mt-0.5 truncate text-xs text-white/35" title={ideaPreview}>
                {shortPreview}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
            <h2 className="text-[22px] font-medium leading-snug tracking-tight text-white">
              {step.question}
            </h2>

            {answeredChips.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {answeredChips.map((chip) => (
                  <span
                    key={chip.question}
                    className="inline-flex items-center rounded-full bg-white/8 px-3 py-1 text-xs text-white/70"
                    title={chip.question}
                  >
                    {chip.answer}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-6 space-y-2 pb-4">
              {step.options.map((opt) => {
                const active = selectedId === opt.id && !showCustom;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => pickOption(opt.id)}
                    className={`group w-full rounded-2xl px-4 py-4 text-left transition-all active:scale-[0.99] ${
                      active
                        ? "bg-white/12 ring-1 ring-violet-400/50"
                        : "bg-white/[0.06] hover:bg-white/10"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                          active
                            ? "border-violet-400 bg-violet-400"
                            : "border-white/25 group-hover:border-white/40"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-white/95">
                          {opt.label}
                        </span>
                        {opt.sub ? (
                          <span className="mt-1 block text-sm leading-snug text-white/45">
                            {opt.sub}
                          </span>
                        ) : null}
                      </span>
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
                      className="w-full rounded-2xl border border-dashed border-white/15 px-4 py-3.5 text-left text-sm text-white/45 transition-colors hover:border-white/25 hover:bg-white/[0.04] hover:text-white/70"
                    >
                      Something else...
                    </button>
                  ) : (
                    <div className="rounded-2xl bg-white/[0.06] p-3">
                      <input
                        type="text"
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitCustom();
                        }}
                        placeholder="Type your answer..."
                        autoFocus
                        className="w-full rounded-xl border-0 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSubmitting || !customText.trim()}
                        onClick={submitCustom}
                        className="mt-2 h-9 w-full rounded-xl bg-violet-600 text-white hover:bg-violet-500"
                      >
                        {isLastStep ? "Generate Script" : "Continue"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/8 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {stepIndex > 0 ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={goBack}
                className="flex items-center gap-1.5 text-sm text-white/45 transition-colors hover:text-white/75"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onSkip}
                className="text-sm text-white/45 transition-colors hover:text-white/75"
              >
                Skip for now
              </button>
            )}

            {isSubmitting ? (
              <span className="flex items-center gap-2 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building your script...
              </span>
            ) : (
              <span className="text-xs text-white/30">
                Tap an option to continue
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
