import { cn } from "@/lib/utils";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

type SpyReelsWordmarkProps = {
  /** "default" matches the expanded app sidebar. "lg" is for full-width headers like onboarding. */
  size?: "default" | "lg";
  className?: string;
};

/**
 * One logo treatment everywhere: mark + word. No per-page italic or split colors on "Reels".
 */
export function SpyReelsWordmark({ size = "default", className }: SpyReelsWordmarkProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <img
        src={LOGO_URL}
        alt="SpyReels"
        className={cn("shrink-0", size === "lg" ? "h-9 w-9" : "h-7 w-7")}
      />
      <span
        className={cn(
          "truncate font-semibold tracking-tight text-foreground",
          size === "lg" ? "text-2xl" : undefined
        )}
      >
        SpyReels
      </span>
    </div>
  );
}
