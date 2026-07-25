import { useMemo, useState } from "react";
import { Images } from "lucide-react";
import {
  CAROUSEL_TEMPLATES,
  type CarouselTemplate,
} from "@shared/carouselTemplates";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { CarouselLibraryCard } from "@/components/CarouselLibraryCard";
import { CarouselPreviewDialog } from "@/components/CarouselPreviewDialog";

export default function CarouselLibrary() {
  const [previewTemplate, setPreviewTemplate] =
    useState<CarouselTemplate | null>(null);

  const templates = useMemo(
    () =>
      CAROUSEL_TEMPLATES.filter((t) => t.active).sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    []
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Images className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carousel Library</h1>
          <p className="text-sm text-muted-foreground">
            Remake proven viral carousels for your niche
          </p>
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No carousel templates are available yet.
        </p>
      ) : (
        <div className={WORKSPACE_REEL_GRID_CLASS}>
          {templates.map((template) => (
            <CarouselLibraryCard
              key={template.id}
              template={template}
              isActive={previewTemplate?.id === template.id}
              onClick={() => setPreviewTemplate(template)}
            />
          ))}
        </div>
      )}

      <CarouselPreviewDialog
        open={previewTemplate != null}
        onOpenChange={(open) => {
          if (!open) setPreviewTemplate(null);
        }}
        template={previewTemplate}
      />
    </div>
  );
}
