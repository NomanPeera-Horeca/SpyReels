import { Instagram, Music2, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReelSourcePlatform = "instagram" | "tiktok" | "youtube";

/**
 * Persistent source mark on reel media (idle and while playing), same idea as
 * YouTube Shorts keeping its logo on screen during playback.
 */
export function ReelSourcePlatformMark({
  platform = "instagram",
  className,
  showLabel = true,
}: {
  platform?: ReelSourcePlatform;
  className?: string;
  showLabel?: boolean;
}) {
  const label =
    platform === "tiktok" ? "TikTok" : platform === "youtube" ? "Shorts" : "Reels";
  const Icon =
    platform === "tiktok" ? Music2 : platform === "youtube" ? Youtube : Instagram;

  return (
    <div
      className={cn(
        "pointer-events-none absolute left-2.5 top-2.5 z-30 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm",
        className
      )}
      aria-hidden
    >
      <Icon className="h-3 w-3 shrink-0" />
      {showLabel ? <span>{label}</span> : null}
    </div>
  );
}
