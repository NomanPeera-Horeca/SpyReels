import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CornerDownLeft, Paperclip, Send, X } from "lucide-react";
import type { ClarificationOption } from "@shared/ideaClarification";

type Props = {
  question: string;
  stepIndex: number;
  totalSteps: number;
  options: ClarificationOption[];
  allowCustom?: boolean;
  disabled?: boolean;
  onPick: (optionId: string) => void;
  onCustom: (text: string) => void;
  onSkip: () => void;
  onBack?: () => void;
  onDismiss?: () => void;
};

export function ClaudeStyleQuestionCard({
  question,
  stepIndex,
  totalSteps,
  options,
  allowCustom,
  disabled,
  onPick,
  onCustom,
  onSkip,
  onBack,
  onDismiss,
}: Props) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    setHighlightIndex(0);
    setShowCustomInput(false);
    setCustomText("");
  }, [question, stepIndex]);

  const selectHighlighted = useCallback(() => {
    const opt = options[highlightIndex];
    if (opt) onPick(opt.id);
  }, [highlightIndex, options, onPick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || showCustomInput) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, options.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        selectHighlighted();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, showCustomInput, options.length, selectHighlighted]);

  return (
    <div className="mx-auto w-full max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-2xl border border-border/80 bg-card shadow-[0_8px_32px_rgba(124,58,237,0.08)] overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border/50">
          <h3 className="text-[15px] font-medium leading-snug text-foreground pr-2">{question}</h3>
          <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {stepIndex > 0 && onBack ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onBack}
                className="p-1 rounded-md hover:bg-violet-50 hover:text-violet-600 transition-colors disabled:opacity-40"
                aria-label="Previous question"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <span className="w-6" />
            )}
            <span className="text-xs tabular-nums whitespace-nowrap px-0.5">
              {stepIndex + 1} of {totalSteps}
            </span>
            <button type="button" disabled className="p-1 rounded-md opacity-30 pointer-events-none" aria-hidden>
              <ChevronRight className="h-4 w-4" />
            </button>
            {onDismiss ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onDismiss}
                className="p-1 rounded-md hover:bg-muted transition-colors ml-0.5 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div>
          {options.map((opt, idx) => {
            const highlighted = idx === highlightIndex && !showCustomInput;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onMouseEnter={() => setHighlightIndex(idx)}
                onClick={() => onPick(opt.id)}
                className={`group w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors border-b border-border/50 last:border-b-0 disabled:opacity-50 ${
                  highlighted ? "bg-violet-50" : "hover:bg-violet-50/60"
                }`}
              >
                <span className="w-5 shrink-0 text-sm text-muted-foreground tabular-nums">{idx + 1}.</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm ${highlighted ? "text-violet-700" : "text-foreground"}`}>
                    {opt.label}
                  </span>
                  {opt.sub ? (
                    <span className="block text-xs text-muted-foreground mt-0.5">{opt.sub}</span>
                  ) : null}
                </span>
                {highlighted ? (
                  <span className="text-xs text-violet-500 shrink-0">↵</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {allowCustom ? (
          <div className="flex items-stretch min-h-[44px] border-t border-border/50 bg-muted/30">
            <div className="flex-1 flex items-center px-5 min-h-[44px]">
              {!showCustomInput ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setShowCustomInput(true)}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 outline-none"
                >
                  <Paperclip className="h-3.5 w-3.5 opacity-60" />
                  Something else
                </button>
              ) : (
                <form
                  className="flex items-center gap-2 w-full"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = customText.trim();
                    if (t) onCustom(t);
                  }}
                >
                  <input
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Type your answer..."
                    autoFocus
                    disabled={disabled}
                    className="flex-1 border-0 bg-transparent text-sm focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={disabled || !customText.trim()}
                    className="h-7 w-7 shrink-0 rounded-full bg-violet-600 text-white flex items-center justify-center disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={onSkip}
              className="shrink-0 px-5 text-sm text-muted-foreground hover:text-violet-600 border-l border-border/50 transition-colors disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        ) : (
          <div className="flex justify-end px-5 py-3 border-t border-border/50 bg-muted/30">
            <button
              type="button"
              disabled={disabled}
              onClick={onSkip}
              className="text-sm text-muted-foreground hover:text-violet-600 transition-colors disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        )}
      </div>
      <p className="text-center text-[11px] text-muted-foreground/75 mt-2.5">
        ↑↓ to navigate · Enter to select · or type below
      </p>
    </div>
  );
}
