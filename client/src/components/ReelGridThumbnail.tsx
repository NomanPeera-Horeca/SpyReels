import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lazy thumbnail for grid/list tiles. No video hooks or playback coordinator. */
export function ReelGridThumbnail({
  thumbnailUrl,
  className,
  fallbackLabel,
  width,
  height,
}: {
  thumbnailUrl: string | null | undefined;
  className?: string;
  fallbackLabel?: string;
  /** Intrinsic size hint for CLS (does not force CSS size when className sets layout). */
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  const thumb = (thumbnailUrl ?? "").trim();

  if (!thumb || failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 text-zinc-400",
          className
        )}
      >
        <Play className="h-8 w-8 fill-current text-zinc-500" />
        {fallbackLabel ? (
          <span className="max-w-[90%] truncate px-2 text-xs font-medium text-zinc-400">
            {fallbackLabel}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={thumb}
      alt=""
      width={width ?? 360}
      height={height ?? 560}
      loading="lazy"
      decoding="async"
      className={cn(
        "h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]",
        className
      )}
      onError={() => setFailed(true)}
    />
  );
}
