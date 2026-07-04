import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ClipboardPaste, Sparkles, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AgentProgressPanel } from "@/components/AgentProgressPanel";
import { useAgentProgressPoll } from "@/hooks/useAgentProgressPoll";
import {
  COACH_AGENT_FOOTER,
  buildCoachScriptProgressSteps,
} from "@shared/coachAgentProgress";

export default function PasteScript() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [converting, setConverting] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const convertMutation = trpc.studio.convertRough.useMutation({
    onSuccess: (script) => {
      setConverting(false);
      toast.success("Production script ready in Studio");
      navigate(`/studio?script=${script.id}`);
    },
    onError: (err) => {
      setConverting(false);
      toast.error(err.message || "Could not convert your script");
    },
  });

  const fetchProgress = useCallback(
    () => utils.studio.getGenerationProgress.fetch(undefined, { staleTime: 0 }),
    [utils.studio.getGenerationProgress]
  );

  const initialSteps = useMemo(() => buildCoachScriptProgressSteps("read_profile"), []);
  const progressSteps = useAgentProgressPoll({
    enabled: converting,
    initialSteps,
    fetchProgress,
  });

  const handleConvert = () => {
    const trimmed = content.trim();
    if (trimmed.length < 20) {
      toast.error("Paste at least a few sentences so we can structure your script");
      return;
    }
    setConverting(true);
    convertMutation.mutate({
      roughScript: trimmed,
      workingTitle: title.trim() || undefined,
    });
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const estimatedDuration = Math.round(wordCount / 2.5);

  if (converting) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <AgentProgressPanel
          steps={progressSteps}
          subheadline="Restructuring your draft into Hook, story, takeaway, CTA, and production notes."
          footer={COACH_AGENT_FOOTER}
          badgeLabel="Converting"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <ClipboardPaste className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Paste Your Script</h1>
          <p className="text-sm text-muted-foreground">
            Paste a rough draft from ChatGPT, Docs, or Notes. We turn it into the same production
            script layout you get from AI Coach.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Working title (optional)</label>
          <Input
            placeholder="e.g. The silent killer in every restaurant kitchen"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-card"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium">Rough script draft</label>
            {wordCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {wordCount} words · ~{estimatedDuration}s
              </span>
            ) : null}
          </div>
          <Textarea
            placeholder="Paste your script here...

We keep your message and voice, then split it into Hook, problem setup, story, takeaway, CTA, plus filming notes."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[300px] bg-card text-sm leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            onClick={handleConvert}
            disabled={convertMutation.isPending || content.trim().length < 20}
            className="gap-2"
          >
            {convertMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Convert to production script
          </Button>
          <p className="text-xs text-muted-foreground">
            Opens in Studio with production notes, refine tools, and teleprompter when you save.
          </p>
        </div>
      </div>
    </div>
  );
}
