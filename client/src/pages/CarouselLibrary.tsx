import { useMemo, useState } from "react";
import { Calendar, Images, LayoutGrid } from "lucide-react";
import {
  CAROUSEL_TEMPLATES,
  CAROUSEL_TEMPLATES_BY_ID,
  type CarouselTemplate,
} from "@shared/carouselTemplates";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { CarouselLibraryCard } from "@/components/CarouselLibraryCard";
import { CarouselPreviewDialog } from "@/components/CarouselPreviewDialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

function formatRemakeDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatScheduledBadge(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function CarouselLibrary() {
  const [previewTemplate, setPreviewTemplate] =
    useState<CarouselTemplate | null>(null);
  const [openRemakeId, setOpenRemakeId] = useState<number | null>(null);

  const remakesQuery = trpc.carouselRemake.list.useQuery({ limit: 20 });
  const remakes = remakesQuery.data ?? [];
  const hasRemakes = remakes.length > 0;

  const templates = useMemo(
    () =>
      CAROUSEL_TEMPLATES.filter((t) => t.active).sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    []
  );

  function openTemplateRemake(template: CarouselTemplate) {
    setOpenRemakeId(null);
    setPreviewTemplate(template);
  }

  function openSavedRemake(remakeId: number, templateId: string) {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(templateId) ?? null;
    if (!template) return;
    setPreviewTemplate(template);
    setOpenRemakeId(remakeId);
  }

  function closePreview() {
    setPreviewTemplate(null);
    setOpenRemakeId(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your Carousels</h2>
          <p className="text-sm text-muted-foreground">
            Reopen remakes you have already generated
          </p>
        </div>

        {remakesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your carousels…</p>
        ) : !hasRemakes ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-5 py-8 text-center">
            <LayoutGrid className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              No saved carousels yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a template below and remake it for your niche. Your remakes
              will show up here so you can reopen, edit, and download anytime.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {remakes.map((remake) => {
              const template = CAROUSEL_TEMPLATES_BY_ID.get(remake.templateId);
              const templateName = template?.name ?? remake.templateId;
              const isFailed = remake.status === "failed";
              const isActive = openRemakeId === remake.id;
              return (
                <button
                  key={remake.id}
                  type="button"
                  disabled={!template}
                  onClick={() => openSavedRemake(remake.id, remake.templateId)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors",
                    "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    isActive && "ring-2 ring-primary/35",
                    isFailed ? "border-destructive/30" : "border-border/50",
                    !template && "cursor-not-allowed opacity-60"
                  )}
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
                    {remake.thumbnailUrl ? (
                      <img
                        src={remake.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
                        {templateName}
                      </div>
                    )}
                    {isFailed ? (
                      <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-medium text-destructive-foreground">
                        Failed
                      </span>
                    ) : remake.postDate ? (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                        <Calendar className="h-2.5 w-2.5" />
                        {formatScheduledBadge(remake.postDate)}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                      {templateName}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {remake.niche}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {remake.postDate
                        ? `Scheduled ${formatRemakeDate(remake.postDate)}`
                        : formatRemakeDate(remake.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Templates</h2>
          <p className="text-sm text-muted-foreground">
            Choose a proven carousel to remake
          </p>
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
                isActive={
                  previewTemplate?.id === template.id && openRemakeId == null
                }
                onClick={() => openTemplateRemake(template)}
              />
            ))}
          </div>
        )}
      </section>

      <CarouselPreviewDialog
        open={previewTemplate != null}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
        template={previewTemplate}
        initialRemakeId={openRemakeId}
      />
    </div>
  );
}
