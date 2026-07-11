import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  COACH_SCRIPT_DOWN_REASONS,
  type CoachScriptDownReasonId,
} from "@shared/coachScriptFeedback";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CoachScriptFeedbackProps = {
  coachScriptId: number;
  className?: string;
};

export function CoachScriptFeedback({ coachScriptId, className }: CoachScriptFeedbackProps) {
  const storageKey = `spyreels_coach_feedback_${coachScriptId}`;
  const [submittedRating, setSubmittedRating] = useState<"up" | "down" | null>(null);
  const [pendingDown, setPendingDown] = useState(false);
  const [reason, setReason] = useState<CoachScriptDownReasonId | "">("");
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "up" || saved === "down") setSubmittedRating(saved);
    } catch {
      // ignore
    }
  }, [storageKey]);

  const submitMutation = trpc.coachScriptFeedback.submit.useMutation({
    onSuccess: (_data, variables) => {
      setSubmittedRating(variables.rating);
      setPendingDown(false);
      try {
        window.localStorage.setItem(storageKey, variables.rating);
      } catch {
        // ignore
      }
      toast.success(
        variables.rating === "up"
          ? "Thanks. Glad this script helped."
          : "Thanks. Your feedback was sent to the SpyReels team."
      );
    },
    onError: (err) => toast.error(err.message || "Could not send feedback."),
  });

  if (submittedRating) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground",
          className
        )}
      >
        {submittedRating === "up"
          ? "Thanks for the thumbs up."
          : "Thanks. We got your feedback."}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <p className="mb-3 text-sm font-medium text-foreground">Was this script useful?</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={submitMutation.isPending}
          onClick={() => submitMutation.mutate({ coachScriptId, rating: "up" })}
        >
          {submitMutation.isPending && !pendingDown ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ThumbsUp className="h-3.5 w-3.5" />
          )}
          Yes
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={submitMutation.isPending}
          onClick={() => setPendingDown(true)}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          No
        </Button>
      </div>

      {pendingDown ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="space-y-2">
            <Label htmlFor="coach-feedback-reason">What was off?</Label>
            <Select
              value={reason || undefined}
              onValueChange={(value) => setReason(value as CoachScriptDownReasonId)}
            >
              <SelectTrigger id="coach-feedback-reason">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {COACH_SCRIPT_DOWN_REASONS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-feedback-note">Anything else? (optional)</Label>
            <Textarea
              id="coach-feedback-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="One short note is enough"
              className="min-h-[72px] resize-y"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!reason || submitMutation.isPending}
              onClick={() => {
                if (!reason) return;
                submitMutation.mutate({
                  coachScriptId,
                  rating: "down",
                  reason,
                  note: note.trim() || undefined,
                });
              }}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send feedback"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={submitMutation.isPending}
              onClick={() => {
                setPendingDown(false);
                setReason("");
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
