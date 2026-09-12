import { Copy, ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { LibraryRemakeSource } from "@/lib/libraryRemakeChainCore";
import {
  formatRemakeSourceTime,
  normalizeRemakeSourceSegments,
} from "@/lib/remakeSourceTranscript";
import { trpc } from "@/lib/trpc";

type SourceReferenceInput =
  | { reelId: number }
  | { featuredReelId: number }
  | { tiktokVideoId: number }
  | { youtubeVideoId: number };

type Props = {
  open: boolean;
  onClose: () => void;
  source: LibraryRemakeSource | null;
  reelId: number | null;
};

function referenceInput(
  source: LibraryRemakeSource | null,
  reelId: number | null
): SourceReferenceInput | null {
  if (!source) return reelId != null ? { reelId } : null;
  if (source.source === "featured") {
    return { featuredReelId: source.featuredReelId };
  }
  if (source.source === "tiktok") {
    return { tiktokVideoId: source.tiktokVideoId };
  }
  if (source.source === "youtube") {
    return { youtubeVideoId: source.youtubeVideoId };
  }
  if (source.source === "user") {
    return { reelId: source.reelId };
  }
  const collectedReelId = reelId ?? source.transcriptionReelId ?? null;
  return collectedReelId != null ? { reelId: collectedReelId } : null;
}

function platformLabel(platform: string | null | undefined): string {
  if (platform === "tiktok") return "TikTok";
  if (platform === "youtube") return "YouTube";
  return "Instagram Reel";
}

function creatorLabel(value: string | null | undefined): string | null {
  const creator = value?.trim();
  if (!creator) return null;
  return creator.startsWith("@") ? creator : `@${creator}`;
}

export function RemakeSourceDrawer({ open, onClose, source, reelId }: Props) {
  const input = referenceInput(source, reelId);
  const query = trpc.transcribe.sourceReference.useQuery(
    input ?? { reelId: 0 },
    {
      enabled: open && input != null,
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  if (!open) return null;

  const data = query.data;
  const segments = normalizeRemakeSourceSegments(data?.segments);
  const transcript = String(data?.transcript ?? "").trim();
  const copyText = transcript || segments.map((segment) => segment.text).join("\n\n");
  const creator = creatorLabel(data?.creator);
  const sourceMeta = [platformLabel(data?.platform), creator].filter(Boolean).join(" · ");

  const copyTranscript = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      toast.success("Transcript copied");
    } catch {
      toast.error("Could not copy transcript");
    }
  };

  const openOriginal = () => {
    const url = data?.originalUrl?.trim();
    if (!url) {
      toast.message("Original post is no longer available");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[360px] max-w-[88%] flex-col border-l border-[#332e45] bg-[#15121d] shadow-[-18px_0_50px_rgba(0,0,0,0.28)]">
      <div className="border-b border-[#302b40] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">Source transcript</h3>
            <p className="mt-1 text-[11px] text-[#827b92]">Original Reel, for reference</p>
          </div>
          <button
            type="button"
            aria-label="Close source transcript"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#928aa3] hover:bg-[#292437] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!copyText}
            onClick={() => void copyTranscript()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#393249] bg-[#1f1b29] px-2.5 py-2 text-[11px] font-semibold text-[#bbb3c8] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" /> Copy transcript
          </button>
          <button
            type="button"
            disabled={!data?.originalUrl}
            onClick={openOriginal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#393249] bg-[#1f1b29] px-2.5 py-2 text-[11px] font-semibold text-[#bbb3c8] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title={data?.originalUrl ? "Open the original post in a new tab" : "Original post is no longer available"}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open original
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {query.isLoading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[#8f879f]">
            <Loader2 className="h-4 w-4 animate-spin text-violet-400" /> Loading source...
          </div>
        ) : query.isError ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <p className="text-sm font-semibold text-white">Source unavailable</p>
            <p className="mt-1 text-xs leading-relaxed text-[#9d94aa]">
              We could not load the original transcript for this Reel.
            </p>
          </div>
        ) : input == null ? (
          <div className="rounded-xl border border-[#302b40] bg-[#1b1724] p-4 text-xs leading-relaxed text-[#8f879f]">
            Source details are not available for this remake.
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-xl border border-[#302b40] bg-[#1b1724] p-3">
              {data?.title?.trim() ? (
                <p className="line-clamp-3 text-xs font-semibold leading-relaxed text-[#e7e1ef]">
                  {data.title.trim()}
                </p>
              ) : null}
              <p className={`${data?.title?.trim() ? "mt-2" : ""} text-[10px] text-[#7e758d]`}>
                {sourceMeta || "Original source"}
                {data?.durationSec != null ? ` · ${formatRemakeSourceTime(data.durationSec)}` : ""}
              </p>
            </div>

            {data?.transcriptionStatus === "processing" ? (
              <div className="rounded-xl border border-[#302b40] bg-[#1b1724] p-4 text-xs leading-relaxed text-[#8f879f]">
                Transcript is still processing.
              </div>
            ) : segments.length > 0 ? (
              <div>
                {segments.map((segment, index) => (
                  <div
                    key={`${segment.startSeconds}-${index}`}
                    className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 border-b border-[#282331] py-3 last:border-b-0"
                  >
                    <span className="pt-0.5 text-[10px] font-medium tabular-nums text-violet-300/70">
                      {formatRemakeSourceTime(segment.startSeconds)}
                    </span>
                    <p className="text-xs leading-5 text-[#c8c1d2]">{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : transcript ? (
              <div className="whitespace-pre-wrap text-xs leading-6 text-[#c8c1d2]">
                {transcript}
              </div>
            ) : (
              <div className="rounded-xl border border-[#302b40] bg-[#1b1724] p-4 text-xs leading-relaxed text-[#8f879f]">
                No transcript is available for this source.
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
