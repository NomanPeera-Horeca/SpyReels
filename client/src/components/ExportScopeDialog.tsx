import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EXPORT_TOP_VIRAL_COUNT,
  type ExportScope,
} from "@shared/exportScope";
import { Flame, Loader2 } from "lucide-react";

type ExportScopeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reelCount: number;
  isRegenerate?: boolean;
  isPending?: boolean;
  onConfirm: (scope: ExportScope) => void;
};

export function ExportScopeDialog({
  open,
  onOpenChange,
  reelCount,
  isRegenerate = false,
  isPending = false,
  onConfirm,
}: ExportScopeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-card-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isRegenerate ? "Regenerate export" : "Export to Excel"}
          </DialogTitle>
          <DialogDescription>
            This account has {reelCount.toLocaleString()} reels. Full export transcribes
            every reel and can take a long time. Choose what to include.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <Button
            type="button"
            className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
            disabled={isPending}
            onClick={() => onConfirm("top_viral_30")}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Flame className="h-4 w-4 shrink-0" />
              Top {EXPORT_TOP_VIRAL_COUNT} viral reels (recommended)
            </span>
            <span className="text-xs font-normal opacity-90">
              Best performers for this account. Fastest export, ideal for content ideas.
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
            disabled={isPending}
            onClick={() => onConfirm("all")}
          >
            <span className="font-semibold">All {reelCount.toLocaleString()} reels</span>
            <span className="text-xs font-normal text-muted-foreground">
              Full account teardown. Uses more transcription credits and takes longer.
            </span>
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>

        {isPending ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting export…
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
