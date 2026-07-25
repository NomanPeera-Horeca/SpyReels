import { useState } from "react";
import type { CarouselTemplate } from "@shared/carouselTemplates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarouselRenderer } from "@/components/CarouselRenderer";
import { Wand2 } from "lucide-react";

export type CarouselPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CarouselTemplate | null;
};

/**
 * Preview / remake modal for a carousel template.
 * Follows GridReelWorkflowDialog DialogContent conventions.
 * Remake is stubbed until niche text generation ships.
 */
export function CarouselPreviewDialog({
  open,
  onOpenChange,
  template,
}: CarouselPreviewDialogProps) {
  const [showRemakeStub, setShowRemakeStub] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setShowRemakeStub(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton
        className="flex max-h-[min(90vh,880px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {template ? template.name : "Carousel preview"}
          </DialogTitle>
        </DialogHeader>
        {template ? (
          <>
            <div className="flex shrink-0 flex-col gap-1 border-b border-border/40 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1">
                <p className="text-base font-semibold text-foreground">
                  {template.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {template.sourceAttribution}
                </p>
              </div>
              <span className="shrink-0 self-start rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {template.slides.length} slides
              </span>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pt-3">
              <CarouselRenderer template={template} />
            </div>

            <div className="shrink-0 space-y-2 border-t border-border/40 p-4">
              {showRemakeStub ? (
                <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                  Niche remake is coming in the next step. Generation is not
                  wired yet.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  className="gap-2"
                  onClick={() => setShowRemakeStub(true)}
                >
                  <Wand2 className="h-4 w-4" />
                  Remake for my niche
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
