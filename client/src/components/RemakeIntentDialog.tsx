import { useEffect, useState } from "react";
import {
  ExternalLink,
  FileText,
  Lightbulb,
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
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { YouTubeInlineEmbed } from "@/components/YouTubeInlineEmbed";
import {
  clearPendingRemakeIntentMedia,
  getPendingRemakeIntentMedia,
  type RemakeIntent,
  type RemakeIntentMedia,
} from "@/lib/remakeIntent";
import { resolveYouTubeVideoId } from "@/lib/youtubeVideoId";

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
  const [media, setMedia] = useState<RemakeIntentMedia | null>(null);

  // Transcription still runs in the background. It is intentionally not exposed
  // here because the creator only needs to decide what they want to make.
  void progressPercent;

  useEffect(() => {
    if (!open) return;
    setMode("custom");
    setAngle("");
    setMedia(getPendingRemakeIntentMedia());
  }, [open]);

  const canSubmit = mode !== "custom" || angle.trim().length > 0;

  const submit = () => {
    let intent: RemakeIntent | null = null;
    if (mode === "niche") intent = { mode: "niche" };
    else if (mode === "same_topic") intent = { mode: "same_topic" };
    else if (angle.trim()) intent = { mode: "custom", angle: angle.trim() };
    if (!intent) return;
    clearPendingRemakeIntentMedia();
    onSubmit(intent);
  };

  const cancel = () => {
    clearPendingRemakeIntentMedia();
    onCancel();
  };

  const platform = media?.platform ?? "instagram";
  const originalUrl = media?.originalUrl?.trim() || media?.videoPageUrl?.trim() || "";
  const youtubeVideoId =
    platform === "youtube"
      ? resolveYouTubeVideoId({
          shortcode: media?.shortcode,
          reelUrl: originalUrl || media?.videoPageUrl,
        })
      : null;
  const hasSourceMedia = Boolean(
    media &&
      ((media.thumbnailUrl ?? "").trim() ||
        (media.videoUrl ?? "").trim() ||
        (media.shortcode ?? "").trim() ||
        originalUrl)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92vh,850px)] max-h-[92vh] w-[min(1180px,100%)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-[#2d2940] bg-[#1c1926] p-0 text-[#f5f2fa] sm:max-w-[min(1180px,calc(100%-1.5rem))]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Choose how to remake this Reel</DialogTitle>
          <DialogDescription>Choose the direction for your Remake.</DialogDescription>
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
            <button type="button" className="rounded-lg bg-[#302a42] px-4 py-2 text-[13px] font-semibold text-white">
              Script
            </button>
            <button type="button" disabled className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[#655f70]">
              Visuals
            </button>
            <button type="button" disabled className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[#655f70]">
              Preview
            </button>
          </nav>

          <div className="flex items-center justify-end gap-2">
            {originalUrl ? (
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#211d2d] px-3 py-2 text-xs font-semibold text-[#b7b0c7] hover:text-white"
              >
                <ExternalLink className="h-4 w-4" /> Open original
              </a>
            ) : null}
            <button
              type="button"
              aria-label="Cancel remake"
              onClick={cancel}
              className="grid h-9 w-9 place-items-center rounded-lg text-[#928aa3] hover:bg-[#292437] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[330px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-[#2d2940] bg-[#191620] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#777083]">
              Original Reel
            </p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[#332e45] bg-black shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
              <div className="relative aspect-[9/14] overflow-hidden bg-black">
                {hasSourceMedia && platform !== "youtube" ? (
                  <DashboardReelGridMedia
                    className="h-full w-full"
                    thumbnailUrl={media?.thumbnailUrl}
                    videoUrl={media?.videoUrl}
                    shortcode={media?.shortcode}
                    reelId={platform === "instagram" ? media?.reelId ?? undefined : undefined}
                    platform={platform === "tiktok" ? "tiktok" : "instagram"}
                    videoPageUrl={media?.videoPageUrl ?? media?.originalUrl}
                    fallbackLabel="Source Reel"
                  />
                ) : hasSourceMedia && youtubeVideoId ? (
                  <YouTubeInlineEmbed
                    className="h-full w-full"
                    videoId={youtubeVideoId}
                  />
                ) : hasSourceMedia && media?.thumbnailUrl ? (
                  <div className="relative h-full w-full">
                    <ReelGridThumbnail
                      className="h-full w-full"
                      thumbnailUrl={media.thumbnailUrl}
                      width={360}
                      height={560}
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div>
                      <FileText className="mx-auto h-8 w-8 text-[#615a70]" />
                      <p className="mt-3 text-sm font-semibold text-[#b7b0c7]">Source preview unavailable</p>
                      {originalUrl ? (
                        <a
                          href={originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
                        >
                          Open original <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#827b92]">
              Watch the original again while you decide how you want to use the idea.
            </p>
          </aside>

          <main className="min-h-0 overflow-y-auto bg-[#1c1926] px-7 py-7">
            <div className="mx-auto max-w-[760px]">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  How do you want to use this Reel?
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-[#9b94aa]">
                  Choose an option or tell us your idea. SpyReels keeps the useful parts of the source and makes it yours.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                <div
                  className={`w-full rounded-2xl border p-4 transition ${
                    mode === "custom"
                      ? "border-violet-500/70 bg-violet-500/[0.08] shadow-[0_0_0_1px_rgba(139,92,246,0.08)]"
                      : "border-[#332e45] bg-[#191620] hover:border-[#4a4262]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setMode("custom")}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300">
                      <Lightbulb className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-white">Use my idea</strong>
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                          Recommended
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#91899f]">
                        Keep what made this Reel work, but make it about your idea.
                      </span>
                    </span>
                    <span
                      className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                        mode === "custom"
                          ? "border-violet-400 bg-violet-500 shadow-[inset_0_0_0_4px_#1c1926]"
                          : "border-[#514a61]"
                      }`}
                    />
                  </button>

                  {mode === "custom" ? (
                    <div className="mt-4 pl-12">
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
                </div>

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
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
