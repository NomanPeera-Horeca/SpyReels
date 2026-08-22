import type { ReactNode } from "react";
import { ViralPostPreview } from "@/components/viral-posts/ViralPostPreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCompactCount,
  formatPostedAge,
  trendStatusLabel,
} from "@/lib/viralPosts/format";
import type { ViralPost } from "@/lib/viralPosts/types";

type WhyItWorksModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: ViralPost | null;
  loading?: boolean;
  onRemake: (post: ViralPost) => void;
};

export function WhyItWorksModal({
  open,
  onOpenChange,
  post,
  loading = false,
  onRemake,
}: WhyItWorksModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(920px,calc(100vw-1.5rem))] overflow-y-auto border-[#2b2739] bg-[#111019] text-[#f6f4fb] sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle className="text-xl text-[#f6f4fb]">
            Why this post is working
          </DialogTitle>
          <DialogDescription className="text-[#a9a4b8]">
            See the pattern, momentum, and why it is relevant to you.
          </DialogDescription>
        </DialogHeader>

        {loading || !post ? (
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <Skeleton className="aspect-[9/12] w-full bg-[#171522]" />
            <div className="space-y-3">
              <Skeleton className="h-16 w-full bg-[#171522]" />
              <Skeleton className="h-28 w-full bg-[#171522]" />
              <Skeleton className="h-24 w-full bg-[#171522]" />
            </div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[240px_1fr]">
            <div className="overflow-hidden rounded-2xl border border-[#2b2739]">
              <ViralPostPreview post={post} compact />
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Metric
                  value={post.relevanceLabel}
                  label="relevance signal"
                />
                <Metric
                  value={formatCompactCount(post.views)}
                  label={`views in ${formatPostedAge(post.postedAt).replace(" ago", "")}`}
                />
                <Metric
                  value={trendStatusLabel(post.trendStatus)}
                  label="momentum signal"
                />
              </div>

              <AnalysisCard title="What is driving the performance">
                <div className="space-y-2">
                  {(post.whyItWorks?.structure?.slice(0, 4) || []).map((item) => (
                    <div
                      key={item}
                      className="rounded-lg border border-[#2b2739] bg-[#171522] px-3 py-2 text-xs text-[#a9a4b8]"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </AnalysisCard>

              <AnalysisCard title="Why it fits your profile">
                <p className="m-0 text-xs leading-relaxed text-[#a9a4b8]">
                  {post.relevanceReason}
                </p>
              </AnalysisCard>

              <AnalysisCard title="Pattern breakdown">
                <ul className="m-0 space-y-1.5 p-0 text-xs leading-relaxed text-[#a9a4b8]">
                  {post.whyItWorks?.hookMechanism ? (
                    <li>
                      <span className="font-bold text-white">Hook: </span>
                      {post.whyItWorks.hookMechanism}
                    </li>
                  ) : null}
                  {post.whyItWorks?.emotionalTrigger ? (
                    <li>
                      <span className="font-bold text-white">Emotional trigger: </span>
                      {post.whyItWorks.emotionalTrigger}
                    </li>
                  ) : null}
                  {post.whyItWorks?.visualPattern ? (
                    <li>
                      <span className="font-bold text-white">Visual pattern: </span>
                      {post.whyItWorks.visualPattern}
                    </li>
                  ) : null}
                  {post.whyItWorks?.ctaStrategy ? (
                    <li>
                      <span className="font-bold text-white">CTA: </span>
                      {post.whyItWorks.ctaStrategy}
                    </li>
                  ) : null}
                  {post.whyItWorks?.timingNote ? (
                    <li>
                      <span className="font-bold text-white">Timing: </span>
                      {post.whyItWorks.timingNote}
                    </li>
                  ) : null}
                </ul>
              </AnalysisCard>

              <AnalysisCard title="What SpyReels would preserve">
                <p className="m-0 text-xs leading-relaxed text-[#a9a4b8]">
                  <strong className="text-white">
                    {post.whyItWorks?.hookMechanism || "The proven structure"}
                  </strong>
                  . The creator's exact wording, examples, and claims would not
                  be copied.
                </p>
              </AnalysisCard>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="border-[#2b2739] bg-transparent text-[#f6f4fb]"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
            disabled={!post}
            onClick={() => {
              if (!post) return;
              onOpenChange(false);
              onRemake(post);
            }}
          >
            Remake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[#2b2739] bg-[#171522] px-3 py-3">
      <p className="text-sm font-bold leading-snug text-white">{value}</p>
      <p className="mt-1 text-[11px] text-[#7e788d]">{label}</p>
    </div>
  );
}

function AnalysisCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#2b2739] bg-[#171522] p-3.5">
      <h4 className="mb-2 text-sm font-bold text-white">{title}</h4>
      {children}
    </div>
  );
}
