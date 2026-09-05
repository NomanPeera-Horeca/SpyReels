import { useMemo, useState } from "react";
import { Images, LayoutGrid } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  CAROUSEL_TEMPLATES,
  CAROUSEL_TEMPLATES_BY_ID,
  type CarouselSlideSpec,
  type CarouselTemplate,
} from "@shared/carouselTemplates";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { CarouselLibraryCard } from "@/components/CarouselLibraryCard";
import { RemakeHistoryCard } from "@/components/RemakeHistoryCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  CAROUSELS_PATH,
  buildCarouselEditHref,
} from "@/components/carousel-studio/carouselsHub";
import { CAROUSEL_LIBRARY_DOCUMENT_TITLE } from "@/components/carousel-studio/carouselPageMeta";
import { useCarouselDocumentTitle } from "@/components/carousel-studio/useCarouselDocumentTitle";

export default function CarouselLibrary() {
  const [, setLocation] = useLocation();
  useCarouselDocumentTitle(CAROUSEL_LIBRARY_DOCUMENT_TITLE);
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(
    null
  );
  const [remakePendingDelete, setRemakePendingDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const remakesQuery = trpc.carouselRemake.list.useQuery({ limit: 20 });
  const remakes = remakesQuery.data ?? [];
  const hasRemakes = remakes.length > 0;

  const deleteMutation = trpc.carouselRemake.delete.useMutation({
    onSuccess: () => {
      void utils.carouselRemake.list.invalidate();
      setRemakePendingDelete(null);
      toast.success("Carousel deleted");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete carousel");
    },
  });

  const templates = useMemo(
    () =>
      CAROUSEL_TEMPLATES.filter((t) => t.active).sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    []
  );

  const startTemplateMutation = trpc.carouselRemake.start.useMutation({
    onSuccess: (data) => {
      void utils.carouselRemake.list.invalidate();
      toast.success("Carousel remake started");
      setLocation(buildCarouselEditHref(data.remakeId));
    },
    onError: (err) => {
      setStartingTemplateId(null);
      toast.error(err.message || "Failed to start remake");
    },
  });

  function openTemplateRemake(template: CarouselTemplate) {
    if (startTemplateMutation.isPending) return;
    setStartingTemplateId(template.id);
    startTemplateMutation.mutate({ templateId: template.id });
  }

  function openSavedRemake(remakeId: number, templateId: string) {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(templateId) ?? null;
    if (!template) return;
    setLocation(buildCarouselEditHref(remakeId));
  }

  function handleConfirmDelete() {
    if (!remakePendingDelete || deleteMutation.isPending) return;
    deleteMutation.mutate({ remakeId: remakePendingDelete.id });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-4">
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => setLocation(CAROUSELS_PATH)}
        >
          ← Back to Carousels
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Images className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Library</h1>
            <p className="text-sm text-muted-foreground">
              Reopen saved carousels, or remake a proven template
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your Carousels</h2>
          <p className="text-sm text-muted-foreground">
            Work you have already generated
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
              Create a carousel from Carousels. Saved work will show up here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {remakes.map((remake) => {
              const template = CAROUSEL_TEMPLATES_BY_ID.get(remake.templateId);
              const templateName = template?.name ?? remake.templateId;
              return (
                <RemakeHistoryCard
                  key={remake.id}
                  templateName={
                    remake.title?.trim() || templateName
                  }
                  niche={remake.niche}
                  status={remake.status}
                  createdAt={remake.createdAt}
                  postDate={remake.postDate}
                  thumbnailUrl={remake.thumbnailUrl}
                  slideImageUrls={remake.slideImageUrls}
                  previewTemplate={template}
                  previewSlides={remake.slideStructure as CarouselSlideSpec[] | null}
                  previewSlideValues={remake.slotValues}
                  previewImageUrls={remake.imageUrls}
                  previewAspect={remake.aspectRatioOverride}
                  disabled={!template}
                  onClick={() => openSavedRemake(remake.id, remake.templateId)}
                  onDeleteRequest={() =>
                    setRemakePendingDelete({ id: remake.id, name: templateName })
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Templates</h2>
          <p className="text-sm text-muted-foreground">
            Remake a proven structure for your niche
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
                isActive={startingTemplateId === template.id}
                onClick={() => openTemplateRemake(template)}
              />
            ))}
          </div>
        )}
      </section>

      <AlertDialog
        open={remakePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setRemakePendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this carousel?</AlertDialogTitle>
            <AlertDialogDescription>
              {remakePendingDelete
                ? `"${remakePendingDelete.name}" will be removed from Your Carousels. This does not refund monthly remake usage.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                deleteMutation.isPending && "pointer-events-none opacity-50"
              )}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
