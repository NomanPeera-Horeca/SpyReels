import { useState } from "react";
import { ClipboardPen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FeatureRequestCardProps = {
  className?: string;
};

export function FeatureRequestCard({ className }: FeatureRequestCardProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  const submitMutation = trpc.featureRequest.submit.useMutation({
    onSuccess: () => {
      toast.success("Feature request sent. Thanks for helping improve SpyReels.");
      setOpen(false);
      setTitle("");
      setDetails("");
    },
    onError: (err) => {
      toast.error(err.message || "Could not send your request.");
    },
  });

  const titleOk = title.trim().length >= 3;
  const detailsOk = details.trim().length >= 10;
  const canSubmit = titleOk && detailsOk && !submitMutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    submitMutation.mutate({
      title: title.trim(),
      details: details.trim(),
    });
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-4 sm:p-5",
          className
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <ClipboardPen className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Missing a Feature?</h2>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Have an idea to make the platform better? We&apos;d love to hear it!
        </p>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          Request a Feature
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a feature</DialogTitle>
            <DialogDescription>
              Tell us what you need. Your request goes straight to the SpyReels team.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feature-request-title">What are you missing?</Label>
              <Input
                id="feature-request-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Export scripts to Notion"
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feature-request-details">Tell us more</Label>
              <Textarea
                id="feature-request-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="How would this help your workflow?"
                maxLength={2000}
                className="min-h-[120px] resize-y"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send request"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
