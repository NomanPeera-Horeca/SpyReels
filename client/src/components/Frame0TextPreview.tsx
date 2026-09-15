import { useEffect, useState } from "react";
import { Camera, Move } from "lucide-react";
import type { LibraryRemakeSource } from "@/lib/libraryRemakeChainCore";
import { deriveFrame0Text } from "@shared/frame0Text";

type Props = {
  script: string;
  /**
   * Kept for call-site compatibility. Preview intentionally never renders
   * source creator identity, source platform chrome, or source media.
   */
  source: LibraryRemakeSource | null;
  reelId: number | null;
};

/**
 * Platform-neutral opening-frame preview for the creator's own Reel.
 *
 * A remake source is research context only. Reusing its thumbnail, handle,
 * caption, or platform UI here falsely implies the creator will publish the
 * source asset. Until SpyReels has an explicit destination platform and the
 * creator's own footage, the honest preview is a neutral 9:16 composition.
 */
export function Frame0TextPreview({ script }: Props) {
  const suggested = deriveFrame0Text(script);
  const [text, setText] = useState(suggested);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (edited) return;
    setText(suggested);
  }, [edited, suggested]);

  return (
    <div className="h-full overflow-y-auto px-7 py-6">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Opening Hook</h3>
            <p className="mt-1 max-w-[520px] text-xs leading-relaxed text-[#8f879f]">
              Preview the hook on your own 9:16 footage. The source Reel is reference only and is never shown as your post.
            </p>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-[#332e42] bg-[#211d2b] px-2.5 py-1 text-[10px] font-semibold text-[#aaa2b8] sm:flex">
            <Move className="h-3 w-3" /> 9:16 safe frame
          </div>
        </div>

        <div className="flex justify-center">
          <div className="relative aspect-[9/16] w-[320px] overflow-hidden rounded-[26px] border border-[#393449] bg-[#0c0b10] shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,#433f4d_0%,#23202a_34%,#111016_68%,#08070a_100%)]" />
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/32 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/72 to-transparent" />

            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-4">
              <span className="rounded-full border border-white/12 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white/80 backdrop-blur-sm">
                Your Reel
              </span>
              <span className="rounded-full border border-white/12 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white/65 backdrop-blur-sm">
                9:16
              </span>
            </div>

            <div className="absolute left-1/2 top-[20%] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] font-medium text-white/45 backdrop-blur-sm">
              <Camera className="h-3 w-3" /> Your footage
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
              className="absolute left-5 right-5 top-[31%] min-h-[150px] resize-none overflow-hidden rounded-xl border border-white/12 bg-black/16 p-3 text-[25px] font-black leading-[1.02] tracking-[-0.02em] text-white outline-none [text-shadow:0_2px_14px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.9)] backdrop-blur-[2px] transition focus:border-violet-400/55 focus:bg-black/28"
              placeholder="ADD YOUR OPENING HOOK"
            />

            <div className="pointer-events-none absolute inset-x-4 top-[18%] h-[58%] rounded-xl border border-dashed border-white/12" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
