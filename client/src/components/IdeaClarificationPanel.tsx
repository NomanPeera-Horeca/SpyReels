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
    ideaPreview.length > 56 ? `${ideaPreview.slice(0, 56).trim()}...` : ideaPreview;

  return (
    <div className="fixed inset-0 z-[100] font-sans pointer-events-none">
      <button
        type="button"
        aria-label="Close clarification"
        className="absolute inset-0 bg-black/25 pointer-events-auto"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 sm:px-4 sm:pb-5 pointer-events-none"
      >
        <div
          className="pointer-events-auto flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#232326] shadow-[0_-8px_40px_rgba(0,0,0,0.35)] animate-in slide-in-from-bottom-6 duration-250 ease-out"
          style={{ maxHeight: "min(55vh, 480px)" }}
        >
          <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-white/20" aria-hidden />

          <div className="mx-3 mt-2 h-0.5 shrink-0 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full bg-violet-500 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-1">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Question {stepIndex + 1} of {totalSteps}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-white/30" title={ideaPreview}>
                {shortPreview}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-1">
            <h2 className="text-base font-medium leading-snug text-white/95 sm:text-[17px]">
              {step.question}
            </h2>

            {answeredChips.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {answeredChips.map((chip) => (
                  <span
                    key={chip.question}
                    className="inline-flex items-center rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/60"
                    title={chip.question}
                  >
                    {chip.answer}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-3 space-y-1.5 pb-2">
              {step.options.map((opt) => {
                const active = selectedId === opt.id && !showCustom;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => pickOption(opt.id)}
                    className={`group w-full rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.99] ${
                      active
                        ? "bg-white/12 ring-1 ring-violet-400/40"
                        : "bg-white/[0.05] hover:bg-white/[0.09]"
                    }`}
                  >
                    <span className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors ${
                          active
                            ? "border-violet-400 bg-violet-400"
                            : "border-white/25 group-hover:border-white/40"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug text-white/90">
                          {opt.label}
                        </span>
                        {opt.sub ? (
                          <span className="mt-0.5 block text-xs leading-snug text-white/40">
                            {opt.sub}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                );
              })}

              {step.allowCustom ? (
                <div>
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
                      className="w-full rounded-xl border border-dashed border-white/12 px-3 py-2.5 text-left text-xs text-white/40 transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-white/60"
                    >
                      Something else...
                    </button>
                  ) : (
                    <div className="rounded-xl bg-white/[0.05] p-2.5">
                      <input
                        type="text"
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitCustom();
                        }}
                        placeholder="Type your answer..."
                        autoFocus
                        className="w-full rounded-lg border-0 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSubmitting || !customText.trim()}
                        onClick={submitCustom}
                        className="mt-2 h-8 w-full rounded-lg bg-violet-600 text-xs text-white hover:bg-violet-500"
                      >
                        {isLastStep ? "Generate Script" : "Continue"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/8 px-4 py-2.5">
            {stepIndex > 0 ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={goBack}
                className="flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/70"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onSkip}
                className="text-xs text-white/40 transition-colors hover:text-white/70"
              >
                Skip
              </button>
            )}

            {isSubmitting ? (
              <span className="flex items-center gap-1.5 text-xs text-white/45">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Building script...
              </span>
            ) : (
              <span className="text-[10px] text-white/28">Tap to continue</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
