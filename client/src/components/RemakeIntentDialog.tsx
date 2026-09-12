import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RemakeIntent } from "@/lib/remakeIntent";

export function RemakeIntentDialog({
  open,
  progressPercent,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  progressPercent: number;
  onSubmit: (intent: RemakeIntent) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<RemakeIntent["mode"] | null>(null);
  const [angle, setAngle] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(null);
    setAngle("");
  }, [open]);

  const canSubmit = mode != null && (mode !== "custom" || angle.trim().length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-[min(560px,calc(100%-1rem))] max-w-[560px] gap-0 overflow-hidden border-[#2d2940] bg-[#1b1824] p-0 text-[#f5f2fa]"
      >
        <DialogHeader className="border-b border-[#2d2940] px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-base font-bold text-white">
                What do you want to make from this?
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-[#8f879f]">
                Pick the direction. SpyReels is transcribing the source in the background.
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Cancel remake"
              onClick={onCancel}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#928aa3] hover:bg-[#292437] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-3 p-5">
          <button
            type="button"
            onClick={() => setMode("niche")}
            className={`w-full rounded-xl border p-4 text-left transition ${
              mode === "niche"
                ? "border-violet-500/50 bg-violet-500/10"
                : "border-[#332e45] bg-[#191620] hover:border-[#4a4262]"
            }`}
          >
            <strong className="block text-sm text-white">Adapt to my niche</strong>
            <span className="mt-1 block text-xs text-[#91899f]">
              SpyReels chooses a strong idea for your audience and keeps the source structure.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode("same_topic")}
            className={`w-full rounded-xl border p-4 text-left transition ${
              mode === "same_topic"
                ? "border-violet-500/50 bg-violet-500/10"
                : "border-[#332e45] bg-[#191620] hover:border-[#4a4262]"
            }`}
          >
            <strong className="block text-sm text-white">Keep this topic</strong>
            <span className="mt-1 block text-xs text-[#91899f]">
              Same subject and core message, rewritten in your voice.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`w-full rounded-xl border p-4 text-left transition ${
              mode === "custom"
                ? "border-violet-500/50 bg-violet-500/10"
                : "border-[#332e45] bg-[#191620] hover:border-[#4a4262]"
            }`}
          >
            <strong className="block text-sm text-white">Use my idea</strong>
            <span className="mt-1 block text-xs text-[#91899f]">
              Keep what made the Reel work, but make it about your idea.
            </span>
          </button>

          {mode === "custom" ? (
            <textarea
              autoFocus
              value={angle}
              onChange={(event) => setAngle(event.target.value)}
              placeholder='Example: Use this 4-box structure for "How to write a restaurant menu"'
              className="min-h-[92px] w-full resize-y rounded-xl border border-[#393349] bg-[#15121c] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-[#6f687d] focus:border-violet-500/50"
            />
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="inline-flex min-w-0 items-center gap-2 text-[11px] text-[#8f879f]">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-400" />
              <span className="truncate">Transcribing source in background · {Math.max(0, Math.min(99, progressPercent))}%</span>
            </div>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                if (mode === "niche") onSubmit({ mode: "niche" });
                else if (mode === "same_topic") onSubmit({ mode: "same_topic" });
                else if (mode === "custom" && angle.trim()) {
                  onSubmit({ mode: "custom", angle: angle.trim() });
                }
              }}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" /> Create remake
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
