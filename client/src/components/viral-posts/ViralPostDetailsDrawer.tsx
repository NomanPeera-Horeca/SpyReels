import { ViralPostPreview } from "@/components/viral-posts/ViralPostPreview";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCompactCount,
  formatCreatorHandle,
  formatEngagementPct,
  formatNicheSignal,
  formatShortPostDate,
  viralPostCreatorProfileUrl,
  whyItWorksBullets,
} from "@/lib/viralPosts/format";
import type { ViralPost } from "@/lib/viralPosts/types";

type ViralPostDetailsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: ViralPost | null;
  loading?: boolean;
  onRemake: (post: ViralPost) => void;
};

function platformOpenLabel(platform: ViralPost["platform"]): string {
  if (platform === "tiktok") return "Open on TikTok";
  if (platform === "youtube") return "Open on YouTube";
  return "Open on Instagram";
}

function drawerCaption(post: ViralPost): string {
  if (post.hook?.trim()) return post.hook.trim();
  if (post.caption?.trim()) return post.caption.trim();
  return "Viral post in your niche";
}

function drawerMetrics(post: ViralPost): {
  line: string;
  signal: string | null;
} {
  const chunks: string[] = [];
  const views = formatCompactCount(post.views);
  if (views) chunks.push(`${views} views`);
  const likes = formatCompactCount(post.likes);
  if (likes) chunks.push(`${likes} likes`);
  const comments = formatCompactCount(post.comments);
  if (comments) chunks.push(`${comments} comments`);
  const shares = formatCompactCount(post.shares);
  if (shares) chunks.push(`${shares} shares`);
  const eng = formatEngagementPct(post.engagementRate);
  if (eng) chunks.push(eng);
  return {
    line: chunks.join(" · "),
    signal: formatNicheSignal(post.reachMultiplier),
  };
}

/**
 * Post details drawer for Viral Posts.
 * Color contract: brand purple only on the Remake commit CTA.
 * Creator links and niche signal stay muted (no purple chrome).
 */
export function ViralPostDetailsDrawer({
  open,
  onOpenChange,
  post,
  loading = false,
  onRemake,
}: ViralPostDetailsDrawerProps) {
  const handle = post
    ? formatCreatorHandle(post.creatorHandle || post.creatorName)
    : "";
  const creatorHref = post ? viralPostCreatorProfileUrl(post) : null;
  const date = post ? formatShortPostDate(post.publishedAt) : null;
  const metrics = post ? drawerMetrics(post) : null;
  const works = post ? whyItWorksBullets(post) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto border-[#2b2739] bg-[#1a1821] p-0 text-[#f5f3f8] sm:max-w-[420px]"
      >
        <SheetHeader className="border-b border-[#2b2739] px-5 py-4 text-left">
          <SheetTitle className="text-base font-bold text-[#f5f3f8]">
            Post details
          </SheetTitle>
          <SheetDescription className="sr-only">
            Why this post fits your niche and how to remake it.
          </SheetDescription>
        </SheetHeader>

        {loading || !post ? (
          <div className="space-y-4 px-5 py-5">
            <Skeleton className="mx-auto aspect-[9/16] w-[58%] max-w-[220px] rounded-2xl bg-[#171522]" />
            <Skeleton className="h-12 w-full bg-[#171522]" />
            <Skeleton className="h-24 w-full bg-[#171522]" />
            <Skeleton className="h-24 w-full bg-[#171522]" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3.5 px-5 py-5">
            <div className="flex justify-center py-1">
              <div className="w-[min(220px,58%)] overflow-hidden rounded-2xl border border-[#2b2739] shadow-[0_12px_28px_rgba(0,0,0,.35)]">
                <ViralPostPreview post={post} quiet portrait />
              </div>
            </div>

            <p className="text-[15px] font-bold leading-snug text-[#f5f3f8]">
              {drawerCaption(post)}
            </p>

            <div className="flex items-center justify-between gap-2.5 text-xs text-[#a8a3b3]">
              {creatorHref ? (
                <a
                  href={creatorHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#a8a3b3] hover:text-[#f5f3f8] hover:underline"
                >
                  {handle}
                </a>
              ) : (
                <span className="font-medium">{handle}</span>
              )}
              {date ? <span>{date}</span> : null}
            </div>

            {metrics && (metrics.line || metrics.signal) ? (
              <p className="text-xs leading-snug text-[#a8a3b3]">
                {metrics.line}
                {metrics.signal ? (
                  <>
                    {metrics.line ? " · " : null}
                    <span className="font-semibold text-[#e8e4f0]">
                      {metrics.signal}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}

            <div className="rounded-[14px] border border-[#2b2739] bg-[#15131b] p-3">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#a8a3b3]">
                Why it fits
              </h4>
              <p className="m-0 text-[13px] leading-relaxed text-[#a8a3b3]">
                {post.relevanceReason}
              </p>
            </div>

            <div className="rounded-[14px] border border-[#2b2739] bg-[#15131b] p-3">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#a8a3b3]">
                Why it works
              </h4>
              <ul className="m-0 grid list-disc gap-1.5 pl-[18px] text-[13px] leading-snug text-[#a8a3b3]">
                {works.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="mt-auto grid gap-2 pt-2">
              <Button
                type="button"
                className="h-11 w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  onOpenChange(false);
                  onRemake(post);
                }}
              >
                Remake this post
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {post.sourceUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-[#2b2739] bg-transparent text-[12px] font-semibold text-[#e8e2f4] hover:bg-white/[0.04]"
                    asChild
                  >
                    <a
                      href={post.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {platformOpenLabel(post.platform)}
                    </a>
                  </Button>
                ) : (
                  <span />
                )}
                {creatorHref ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-[#2b2739] bg-transparent text-[12px] font-semibold text-[#e8e2f4] hover:bg-white/[0.04]"
                    asChild
                  >
                    <a
                      href={creatorHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open creator
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
