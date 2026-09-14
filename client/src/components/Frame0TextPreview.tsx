import { useEffect, useMemo, useState } from "react";
import { Bookmark, Heart, MessageCircle, Music2, Send } from "lucide-react";
import type { LibraryRemakeSource } from "@/lib/libraryRemakeChainCore";
import { remakeSourceReferenceInput } from "@/lib/remakeSourceTranscript";
import { trpc } from "@/lib/trpc";
import { deriveFrame0Text } from "@shared/frame0Text";

type Props = {
  script: string;
  source: LibraryRemakeSource | null;
  reelId: number | null;
};

function normalizeCreator(value: string | null | undefined): string {
  const creator = value?.trim();
  if (!creator) return "@creator";
  return creator.startsWith("@") ? creator : `@${creator}`;
}

/**
 * Social-style preview for one editable Opening Hook.
 * Platform is inferred from the source, never chosen by the creator here.
 */
export function Frame0TextPreview({ script, source, reelId }: Props) {
  const suggested = deriveFrame0Text(script);
  const [text, setText] = useState(suggested);
  const [edited, setEdited] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const input = remakeSourceReferenceInput(source, reelId);

  const sourceQuery = trpc.transcribe.sourceReference.useQuery(
    input ?? { reelId: 0 },
    {
      enabled: input != null,
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (edited) return;
    setText(suggested);
  }, [edited, suggested]);

  const thumbnailUrl = sourceQuery.data?.thumbnailUrl?.trim() || "";
  useEffect(() => {
    setImageFailed(false);
  }, [thumbnailUrl]);

  const platform = sourceQuery.data?.platform ?? "instagram";
  const creator = normalizeCreator(sourceQuery.data?.creator);
  const sourceTitle = sourceQuery.data?.title?.trim() || "";
  const captionPreview = useMemo(() => {
    if (!sourceTitle) return "Your opening hook preview";
    return sourceTitle.replace(/\s+/g, " ").slice(0, 48);
  }, [sourceTitle]);

  const isTikTok = platform === "tiktok";
  const isYouTube = platform === "youtube";

  return (
    <div className="h-full overflow-y-auto px-7 py-6">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-5">
          <h3 className="text-base font-bold text-white">Opening Hook</h3>
          <p className="mt-1 text-xs text-[#8f879f]">
            Use this text in the opening frame to help increase watch time.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="relative aspect-[9/16] w-[320px] overflow-hidden rounded-[26px] border border-[#393449] bg-[#0c0b10] shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
            {thumbnailUrl && !imageFailed ? (
              <img
                src={thumbnailUrl}
                alt=""
                onError={() => setImageFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_26%,#33313b_0%,#17151c_46%,#08070a_100%)]" />
            )}

            <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-black/5 to-black/78" />

            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-4 text-[10px] font-semibold text-white/85">
              <span>{isTikTok ? "Following   For You" : isYouTube ? "Shorts" : "Reels"}</span>
              <span className="rounded-full bg-black/25 px-2 py-1 backdrop-blur-sm">
                {isTikTok ? "TikTok" : isYouTube ? "YouTube" : "Instagram"}
              </span>
            </div>

            <textarea
              value={text}
              onChange={(event) => {
                setEdited(true);
                setText(event.target.value);
              }}
              onFocus={() => setEdited(true)}
              maxLength={90}
              aria-label="Opening Hook on-screen text"
              spellCheck
              className="absolute left-5 right-[58px] top-[30%] min-h-[126px] resize-none overflow-hidden border border-transparent bg-transparent p-0 text-[25px] font-black leading-[1.02] tracking-[-0.02em] text-white outline-none [text-shadow:0_2px_14px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.9)] transition focus:rounded-lg focus:border-white/35 focus:bg-black/16 focus:p-2"
              placeholder="ADD YOUR OPENING HOOK"
            />

            <div className="absolute bottom-[92px] right-3 flex flex-col items-center gap-4 text-white">
              <div className="grid h-9 w-9 place-items-center rounded-full border border-white/70 bg-black/20 text-[10px] font-extrabold shadow-lg backdrop-blur-sm">
                {creator.replace(/^@/, "").slice(0, 1).toUpperCase() || "C"}
              </div>
              <Heart className="h-6 w-6 drop-shadow-lg" fill="white" />
              <MessageCircle className="h-6 w-6 drop-shadow-lg" fill="white" />
              <Send className="h-6 w-6 drop-shadow-lg" fill="white" />
              {isTikTok ? <Music2 className="h-6 w-6 drop-shadow-lg" /> : <Bookmark className="h-6 w-6 drop-shadow-lg" fill="white" />}
            </div>

            <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pr-14 text-white">
              <div className="text-[11px] font-bold drop-shadow-lg">{creator}</div>
              <div className="mt-1 line-clamp-1 text-[10px] text-white/88 drop-shadow-lg">{captionPreview}</div>
              {isTikTok ? (
                <div className="mt-2 flex items-center gap-1 text-[9px] font-medium text-white/88">
                  <Music2 className="h-3 w-3" /> original sound
                </div>
              ) : null}
            </div>

            <div className="pointer-events-none absolute inset-x-4 top-[18%] h-[58%] rounded-xl border border-dashed border-white/0" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
