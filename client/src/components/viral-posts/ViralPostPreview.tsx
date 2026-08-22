import { cn } from "@/lib/utils";
import {
  formatPostedAge,
  trendStatusClass,
  trendStatusLabel,
} from "@/lib/viralPosts/format";
import type { ViralPost } from "@/lib/viralPosts/types";

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
  const trendKey = trendStatusClass(post.trendStatus);
  const age = formatPostedAge(post.publishedAt, post.ageHours);
  const hook = post.hook || post.caption?.slice(0, 120) || "Instagram Reel";

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
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[#12101a]">
          <span className="px-3 text-center text-[11px] font-semibold text-[#7e788d]">
            Thumbnail unavailable
          </span>
        </div>
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10"
        aria-hidden
      />

      <div className="absolute left-2.5 top-2.5 z-[3] inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
        <span aria-hidden>◎</span>
        Instagram
      </div>

      {post.trendStatus !== "unknown" ? (
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
      ) : null}

      {age ? (
        <div className="absolute left-3 top-[47px] z-[3] flex items-center gap-1.5 text-[10px] font-semibold text-white [text-shadow:0_2px_8px_#000]">
          <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
          {age}
        </div>
      ) : null}

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
        {hook}
      </div>
    </button>
  );
}
