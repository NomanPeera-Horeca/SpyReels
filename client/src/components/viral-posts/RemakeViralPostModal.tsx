import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import { generateViralPostRemakeMock } from "@/lib/viralPosts/viralPostsService";
import type {
  ViralPost,
  ViralRemakeAngle,
  ViralRemakePreview,
} from "@/lib/viralPosts/types";

type RemakeViralPostModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: ViralPost | null;
  onOpenWorkspace: (args: {
    post: ViralPost;
    preview: ViralRemakePreview;
  }) => void;
};

type Phase = "choose" | "generating" | "ready";

export function RemakeViralPostModal({
  open,
  onOpenChange,
  post,
  onOpenWorkspace,
}: RemakeViralPostModalProps) {
  const [angle, setAngle] = useState<ViralRemakeAngle>("best");
  const [phase, setPhase] = useState<Phase>("choose");
  const [preview, setPreview] = useState<ViralRemakePreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAngle("best");
    setPhase("choose");
    setPreview(null);
    setBusy(false);
  }, [open, post?.id]);

  const generate = async () => {
    if (!post) return;
    setBusy(true);
    setPhase("generating");
    try {
      const result = await generateViralPostRemakeMock({
        angle,
        hook: post.hook || post.caption,
      });
      setPreview(result);
      setPhase("ready");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(820px,calc(100vw-1.5rem))] overflow-y-auto border-[#2b2739] bg-[#111019] text-[#f6f4fb] sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle className="text-xl text-[#f6f4fb]">
            Remake this post
          </DialogTitle>
          <DialogDescription className="text-[#a9a4b8]">
            Choose how SpyReels should adapt the proven structure to your voice.
          </DialogDescription>
        </DialogHeader>

        {!post ? (
          <Skeleton className="h-48 w-full bg-[#171522]" />
        ) : phase === "choose" ? (
          <div>
            <div className="rounded-xl border border-[#2b2739] bg-[#171522] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#7e788d]">
                Original post
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {post.hook || post.caption || "Original Instagram Reel"}
              </p>
              <p className="mt-3 text-[11px] text-[#7e788d]">
                SpyReels will preserve the successful structure, not copy the
                creator's wording.
              </p>
            </div>

            <h3 className="mb-1 mt-[22px] text-base font-bold text-white">
              How should SpyReels adapt it?
            </h3>
            <p className="m-0 text-sm text-[#a9a4b8]">
              Choose one direction. You can edit everything in the Remake
              workspace.
            </p>

            <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <AngleCard
                active={angle === "best"}
                recommended
                title="Best angle for me"
                description="Use your audience, content pillars, and direct speaking style."
                onClick={() => setAngle("best")}
              />
              <AngleCard
                active={angle === "story"}
                title="Personal story"
                description="Turn the idea into a real lesson from your experience."
                onClick={() => setAngle("story")}
              />
              <AngleCard
                active={angle === "contrarian"}
                title="Contrarian take"
                description="Challenge the common advice and explain a better approach."
                onClick={() => setAngle("contrarian")}
              />
            </div>
          </div>
        ) : phase === "generating" ? (
          <div className="rounded-xl border border-[#2b2739] bg-[#171522] p-4">
            <h4 className="text-sm font-bold text-white">
              Creating your original version
            </h4>
            <p className="mt-2 text-xs text-[#a9a4b8]">
              Using your voice, audience, and the post's proven structure.
            </p>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-full bg-[#1d1a2a]" />
              <Skeleton className="h-4 w-5/6 bg-[#1d1a2a]" />
              <Skeleton className="h-4 w-4/6 bg-[#1d1a2a]" />
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[#2b2739] bg-[#171522] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#7e788d]">
                Your new hook
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {preview.newHook}
              </p>
            </div>
            <div className="rounded-xl border border-[#2b2739] bg-[#171522] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#7e788d]">
                Script preview
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#a9a4b8]">
                {preview.script.replace(/^\[HOOK\].*\n\n/, "").replace(/\[BODY\]\s*/, "").replace(/\n\n\[CTA\].*$/s, "")}
              </p>
            </div>
            <div className="rounded-xl border border-[#2b2739] bg-[#171522] p-4">
              <h4 className="mb-2 text-sm font-bold text-white">
                Ready in the Remake workspace
              </h4>
              <div className="space-y-2">
                {preview.shotGuidance.map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-[#2b2739] bg-[#111019] px-3 py-2 text-xs text-[#a9a4b8]"
                  >
                    {item}
                  </div>
                ))}
                <div className="rounded-lg border border-[#2b2739] bg-[#111019] px-3 py-2 text-xs text-[#a9a4b8]">
                  Caption available for Instagram (TikTok remake in Phase 3B)
                </div>
                <div className="rounded-lg border border-[#2b2739] bg-[#111019] px-3 py-2 text-xs text-[#a9a4b8]">
                  B-roll: {preview.brollSuggestions.slice(0, 2).join(" · ")}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#2b2739] bg-transparent text-[#f6f4fb]"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {phase === "ready" && preview && post ? (
            <Button
              type="button"
              className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              onClick={() => onOpenWorkspace({ post, preview })}
            >
              Open Remake workspace
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              disabled={!post || busy || phase === "generating"}
              onClick={() => void generate()}
            >
              {phase === "generating" ? "Generating…" : "Generate my version"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AngleCard({
  active,
  recommended,
  title,
  description,
  onClick,
}: {
  active: boolean;
  recommended?: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[116px] rounded-[13px] border border-[#2b2739] bg-[#171522] p-4 text-left hover:border-[rgba(155,108,255,.42)]",
        active &&
          "border-[#9b6cff] bg-[rgba(124,58,237,.15)] shadow-[0_0_0_3px_rgba(124,58,237,.11)]"
      )}
    >
      {recommended ? (
        <span className="mb-2 inline-flex rounded-full bg-[rgba(124,58,237,.24)] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#e5d9ff]">
          Recommended
        </span>
      ) : null}
      <strong className="mb-1.5 block text-sm text-white">{title}</strong>
      <span className="text-xs leading-snug text-[#a9a4b8]">{description}</span>
    </button>
  );
}
