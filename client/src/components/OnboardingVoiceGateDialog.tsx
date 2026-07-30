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
import { trpc } from "@/lib/trpc";
import {
  ONBOARDING_AUDIENCE_CHIPS,
  ONBOARDING_NICHE_CHIPS,
} from "@shared/onboardingFlow";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type OnboardingVoiceGateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/**
 * Same two questions as /onboarding, shown as a remake gate when niche/audience
 * are missing. Saves via preferences.updateProfile (existing path).
 */
export function OnboardingVoiceGateDialog({
  open,
  onOpenChange,
  onSaved,
}: OnboardingVoiceGateDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const utils = trpc.useUtils();
  const updateProfile = trpc.preferences.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.onboarding.getState.invalidate();
      toast.success("Saved. Remaking in your voice…");
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Could not save. Try again.");
    },
  });

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setNiche("");
    setAudience("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="mb-2 flex gap-1.5">
          <span
            className={cn(
              "h-1 flex-1 rounded-full",
              step >= 1 ? "bg-primary" : "bg-muted"
            )}
          />
          <span
            className={cn(
              "h-1 flex-1 rounded-full",
              step >= 2 ? "bg-primary" : "bg-muted"
            )}
          />
        </div>

        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold tracking-tight sm:text-2xl">
                What do you create content about?
              </DialogTitle>
              <DialogDescription>
                Your niche shapes every script the AI writes for you.
              </DialogDescription>
            </DialogHeader>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && niche.trim().length >= 3) setStep(2);
              }}
              placeholder="e.g. Fitness, Personal Finance, AI Tools..."
              maxLength={200}
              autoFocus
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition focus:border-primary"
            />
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Popular niches
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ONBOARDING_NICHE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setNiche(chip)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    niche === chip
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
            <DialogFooter className="mt-4 gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={niche.trim().length < 3}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold tracking-tight sm:text-2xl">
                Who are you talking to?
              </DialogTitle>
              <DialogDescription>
                Be specific. &quot;Busy moms who want to lose weight&quot; beats &quot;women.&quot;
              </DialogDescription>
            </DialogHeader>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && audience.trim().length >= 3) {
                  updateProfile.mutate({
                    businessDescription: niche.trim(),
                    targetAudience: audience.trim(),
                  });
                }
              }}
              placeholder="e.g. Busy moms who want to lose 20 lbs..."
              maxLength={200}
              autoFocus
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition focus:border-primary"
            />
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Common audiences
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ONBOARDING_AUDIENCE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAudience(chip)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    audience === chip
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
            <DialogFooter className="mt-4 gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                type="button"
                disabled={audience.trim().length < 3 || updateProfile.isPending}
                onClick={() =>
                  updateProfile.mutate({
                    businessDescription: niche.trim(),
                    targetAudience: audience.trim(),
                  })
                }
              >
                {updateProfile.isPending ? "Saving…" : "Save & remake"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
