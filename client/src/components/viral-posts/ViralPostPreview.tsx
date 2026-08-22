import { cn } from "@/lib/utils";
import {
  formatPostedAge,
  renderHookWithHighlight,
  trendStatusClass,
  trendStatusLabel,
} from "@/lib/viralPosts/format";
import type { ViralPost } from "@/lib/viralPosts/types";

const POSTER_GRADIENTS: Record<string, string> = {
  "poster-1": "from-[#2a1f3d] via-[#1a1428] to-[#0e0c14]",
  "poster-2": "from-[#1f2a3d] via-[#141a28] to-[#0c0e14]",
  "poster-3": "from-[#3d1f2a] via-[#28141a] to-[#140c0e]",
  "poster-4": "from-[#1f3d2a] via-[#14281a] to-[#0c140e]",
  "poster-5": "from-[#3d2a1f] via-[#281a14] to-[#140e0c]",
  "poster-6": "from-[#2a1f3d] via-[#1a1428] to-[#120f18]",
  "poster-7": "from-[#1f243d] via-[#141828] to-[#0c0e14]",
};

type ViralPostPreviewProps = {
  post: ViralPost;
  className?: string;
  compact?: boolean;
  onClick?: () => void;
};

export function ViralPostPreview({
  post,
  className,
  compact = false,
  onClick,
}: ViralPostPreviewProps) {
  const parts = renderHookWithHighlight(post.hook, post.hookHighlight);
  const trendKey = trendStatusClass(post.trendStatus);
  const poster = POSTER_GRADIENTS[post.posterTone || "poster-1"];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative block w-full overflow-hidden rounded-t-[15px] text-left",
        compact ? "aspect-[9/12]" : "aspect-[9/11.2]",
        className
      )}
    >
      {post.thumbnailUrl ? (
        <img
          src={post.thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className={cn("absolute inset-0 bg-gradient-to-br", poster)}
          aria-hidden
        />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10"
        aria-hidden
      />

      <div
        className={cn(
          "absolute left-2.5 top-2.5 z-[3] inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm",
          post.platform === "tiktok" && "border-pink-400/30"
        )}
      >
        <span aria-hidden>{post.platform === "tiktok" ? "♪" : "◎"}</span>
        {post.platform === "tiktok" ? "TikTok" : "Instagram"}
      </div>

      <div
        className={cn(
          "absolute right-2.5 top-2.5 z-[3] rounded-full px-2 py-1 text-[10px] font-extrabold text-white",
          trendKey === "rising" && "bg-emerald-500/85",
          trendKey === "breaking" && "bg-sky-500/85",
          trendKey === "proven" && "bg-violet-500/85",
          trendKey === "saturated" && "bg-orange-500/85"
        )}
      >
        {trendStatusLabel(post.trendStatus)}
      </div>

      <div className="native-meta absolute left-3 top-[47px] z-[3] flex items-center gap-1.5 text-[10px] font-semibold text-white [text-shadow:0_2px_8px_#000]">
        <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
        {formatPostedAge(post.postedAt)}
      </div>

      <div className="absolute left-1/2 top-1/2 z-[3] grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm">
        <span className="ml-0.5 text-sm" aria-hidden>
          ▶
        </span>
      </div>

      <div
        className={cn(
          "absolute bottom-3 left-3 right-3 z-[3] max-w-[92%] text-[17px] font-extrabold leading-snug text-white [text-shadow:0_2px_12px_rgba(0,0,0,.75)]",
          compact && "text-[15px]"
        )}
      >
        {parts ? (
          <>
            {parts.before}
            <span className="text-[#ddceff]">{parts.highlight}</span>
            {parts.after}
          </>
        ) : (
          post.hook
        )}
      </div>
    </button>
  );
}
