import { useEffect, useState } from "react";
import {
  Check,
  FileText,
  Lightbulb,
  Loader2,
  Play,
  Sparkles,
  Target,
  X,
} from "lucide-react";
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
  const [mode, setMode] = useState<RemakeIntent["mode"]>("custom");
  const [angle, setAngle] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("custom");
    setAngle("");
  }, [open]);

  const canSubmit = mode !== "custom" || angle.trim().length > 0;
  const sourceReady = progressPercent >= 64;
  const visibleProgress = sourceReady
    ? 100
    : Math.max(4, Math.min(63, Math.round(progressPercent)));

  const submit = () => {
    if (mode === "niche") onSubmit({ mode: "niche" });
    else if (mode === "same_topic") onSubmit({ mode: "same_topic" });
    else if (angle.trim()) onSubmit({ mode: "custom", angle: angle.trim() });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92vh,850px)] max-h-[92vh] w-[min(1180px,100%)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-[#2d2940] bg-[#1c1926] p-0 text-[#f5f2fa] sm:max-w-[min(1180px,calc(100%-1.5rem))]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Choose how to remake this Reel</DialogTitle>
          <DialogDescription>
            SpyReels is transcribing the source while you choose the direction.
          </DialogDescription>
        </DialogHeader>

        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-[#2d2940] bg-[#1b1824] px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <strong className="text-[15px] text-white">Remake</strong>
              <span className="rounded-full border border-[#3a3450] bg-[#242032] px-2 py-0.5 text-[10px] font-semibold text-[#aca4bd]">
                Based on a viral Reel
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-[#827b92]">
              Turn the source into your version
            </p>
          </div>

          <nav
            className="flex gap-1 rounded-xl border border-[#332e45] bg-[#15121d] p-1"
            aria-label="Remake setup"
          >
            <button
              type="button"
              className="rounded-lg bg-[#302a42] px-4 py-2 text-[13px] font-semibold text-white"
            >
              Script
            </button>
            <button
              type="button"
              disabled
              className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[#655f70]"
            >
              Visuals
            </button>
            <button
              type="button"
              disabled
              className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[#655f70]"
            >
              Preview
            </button>
          </nav>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#211d2d] px-3 py-2 text-xs font-semibold text-[#6f687c]"
            >
              <FileText className="h-4 w-4" /> Source
            </button>
            <button
              type="button"
              aria-label="Cancel remake"
              onClick={onCancel}
              className="grid h-9 w-9 place-items-center rounded-lg text-[#928aa3] hover:bg-[#292437] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[330px_minmax(0,1fr)]">
          <aside className="min-h-0 border-r border-[#2d2940] bg-[#191620] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#777083]">
              Original Reel
            </p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[#332e45] bg-[#121018]">
              <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_25%,rgba(124,58,237,0.20),transparent_38%),linear-gradient(180deg,#191523,#0d0b12)]">
                <div className="absolute left-4 top-4 rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">
                  Source Reel
                </div>
                <div className="text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-black/30 text-white shadow-xl backdrop-blur">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-white">Original stays unchanged</p>
                  <p className="mx-auto mt-1 max-w-[220px] text-xs leading-5 text-[#8f879f]">
                    SpyReels is reading the hook, structure, pacing, and message in the background.
                  </p>
                </div>
              </div>

              <div className="border-t border-[#2d2940] p-4">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[#8f879f]">Source analysis</span>
                  <span className="font-semibold text-violet-300">
                    {sourceReady ? "Ready" : `${Math.max(0, Math.min(63, Math.round(progressPercent)))}%`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#2b2638]">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-[width] duration-500"
                    style={{ width: `${visibleProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto bg-[#1c1926] px-7 py-6">
            <div className="mx-auto max-w-[760px]">
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {sourceReady ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" />
                    )}
                    <span className="truncate text-sm font-semibold text-violet-100">
                      {sourceReady
                        ? "Source ready"
                        : `Transcribing source... ${Math.max(0, Math.min(63, Math.round(progressPercent)))}%`}
                    </span>
                  </div>
                  <span className="hidden text-[11px] text-[#8f879f] sm:block">
                    This runs in the background while you set the direction.
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-950/60">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-[width] duration-500"
                    style={{ width: `${visibleProgress}%` }}
                  />
                </div>
              </div>

              <div className="mt-7">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  How do you want to use this Reel?
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-[#9b94aa]">
                  Choose an option or tell us your idea. SpyReels keeps the useful parts of the source and makes it yours.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => setMode("custom")}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    mode === "custom"
                      ? "border-violet-500/70 bg-violet-500/[0.08] shadow-[0_0_0_1px_rgba(139,92,246,0.08)]"
                      : "border-[#332e45] bg-[#191620] hover:border-[#4a4262]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300">
                      <Lightbulb className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-white">Use my idea</strong>
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                          Recommended
                        </span>
                      </div>
                      <span className="mt-1 block text-xs leading-5 text-[#91899f]">
                        Keep what made this Reel work, but make it about your idea.
                      </span>
                    </div>
                    <span
                      className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                        mode === "custom"
                          ? "border-violet-400 bg-violet-500 shadow-[inset_0_0_0_4px_#1c1926]"
                          : "border-[#514a61]"
                      }`}
                    />
                  </div>

                  {mode === "custom" ? (
                    <div className="mt-4 pl-12" onClick={(event) => event.stopPropagation()}>
                      <textarea
                        autoFocus
                        maxLength={2000}
                        value={angle}
                        onChange={(event) => setAngle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                          if (!angle.trim()) return;
                          event.preventDefault();
                          submit();
                        }}
                        placeholder='Example: Use this 4-box structure for "How to write a restaurant menu"'
                        className="min-h-[108px] w-full resize-y rounded-xl border border-[#3a3449] bg-[#15121c] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-[#6f687d] focus:border-violet-500/60"
                      />
                      <div className="mt-1 text-right text-[10px] text-[#6f687d]">
                        {angle.length}/2000
                      </div>
                    </div>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => setMode("same_topic")}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    mode === "same_topic"
                      ? "border-violet-500/55 bg-violet-500/[0.07]"
                      : "border-[#332e45] bg-[#191620] hover:border-[#4a4262]"
                  }`}
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-white">Keep this topic</strong>
                    <span className="mt-1 block text-xs leading-5 text-[#91899f]">
                      Same subject and core message, rewritten in your voice.
                    </span>
                  </span>
                  <span
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                      mode === "same_topic"
                        ? "border-violet-400 bg-violet-500 shadow-[inset_0_0_0_4px_#1c1926]"
                        : "border-[#514a61]"
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => setMode("niche")}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    mode === "niche"
                      ? "border-violet-500/55 bg-violet-500/[0.07]"
                      : "border-[#332e45] bg-[#191620] hover:border-[#4a4262]"
                  }`}
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300">
                    <Target className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-white">Adapt to my niche</strong>
                    <span className="mt-1 block text-xs leading-5 text-[#91899f]">
                      SpyReels chooses a strong idea for your audience and keeps the source structure.
                    </span>
                  </span>
                  <span
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                      mode === "niche"
                        ? "border-violet-400 bg-violet-500 shadow-[inset_0_0_0_4px_#1c1926]"
                        : "border-[#514a61]"
                    }`}
                  />
                </button>
              </div>

              <button
                type="button"
                disabled={!canSubmit}
                onClick={submit}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white shadow-[0_10px_35px_rgba(124,58,237,0.22)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" /> Create remake
              </button>
              <p className="mt-2.5 text-center text-[11px] text-[#777083]">
                {sourceReady
                  ? "Your source is ready. Generation starts as soon as you choose a direction."
                  : "Generation starts as soon as your direction and the transcript are ready."}
              </p>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
