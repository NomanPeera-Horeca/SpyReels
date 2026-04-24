import { useState, useMemo } from "react";
import { usePostHog } from "@posthog/react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import {
  NicheSelectGrid,
  MAX_NICHES,
} from "@/components/NicheSelectGrid";
import {
  CreatorSelectGrid,
  MAX_CREATORS,
} from "@/components/CreatorSelectGrid";
import { ONBOARDING_NICHES_BY_SLUG } from "@/data/onboardingNiches";

type Variant = "settings" | "page";

const SETTINGS_INTRO = `These power your sidebar recommendations and the /research
          featured feed. Pick up to ${MAX_NICHES} niches and up to
          ${MAX_CREATORS} creators.`;

type InterestsEditorSectionProps = {
  variant: Variant;
};

/**
 * Niche and creator interests for onboarding-powered sidebar and /research.
 * Used on Settings and on the dedicated /interests page.
 */
export function InterestsEditorSection({ variant }: InterestsEditorSectionProps) {
  const posthog = usePostHog();
  const onboardingStateQuery = trpc.onboarding.getState.useQuery();
  const [isEditingInterests, setIsEditingInterests] = useState(false);
  const [draftNicheSlugs, setDraftNicheSlugs] = useState<string[]>([]);
  const [draftCreatorHandles, setDraftCreatorHandles] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const updatePreferences = trpc.onboarding.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("Interests updated");
      setIsEditingInterests(false);
      onboardingStateQuery.refetch();
      utils.onboarding.getState.invalidate();
    },
    onError: (err) =>
      toast.error(err.message || "Failed to save interests"),
  });

  const creatorsQuery = trpc.featured.accountsByNicheSlugs.useQuery(
    { slugs: draftNicheSlugs.length > 0 ? draftNicheSlugs : ["marketing-sales"] },
    { enabled: isEditingInterests && draftNicheSlugs.length > 0 }
  );

  const serverNicheSlugs = onboardingStateQuery.data?.selectedNicheSlugs ?? [];
  const serverCreatorHandles =
    onboardingStateQuery.data?.selectedCreatorHandles ?? [];

  const beginEdit = () => {
    setDraftNicheSlugs([...serverNicheSlugs]);
    setDraftCreatorHandles([...serverCreatorHandles]);
    setIsEditingInterests(true);
  };

  const cancelEdit = () => {
    setIsEditingInterests(false);
    setDraftNicheSlugs([]);
    setDraftCreatorHandles([]);
  };

  const toggleDraftNiche = (slug: string) => {
    setDraftNicheSlugs((prev) => {
      if (prev.includes(slug)) {
        const groups = creatorsQuery.data?.groups ?? {};
        const creatorsInNiche = new Set(
          (groups[slug] ?? []).map((c) => c.handle)
        );
        setDraftCreatorHandles((handles) =>
          handles.filter((h) => !creatorsInNiche.has(h))
        );
        return prev.filter((s) => s !== slug);
      }
      if (prev.length >= MAX_NICHES) return prev;
      return [...prev, slug];
    });
  };

  const toggleDraftCreator = (handle: string) => {
    setDraftCreatorHandles((prev) => {
      if (prev.includes(handle)) return prev.filter((h) => h !== handle);
      if (prev.length >= MAX_CREATORS) return prev;
      return [...prev, handle];
    });
  };

  const handleSaveInterests = () => {
    if (draftNicheSlugs.length === 0) {
      toast.error("Pick at least one niche");
      return;
    }
    posthog?.capture("settings_interests_saved", {
      niches_count: draftNicheSlugs.length,
      creators_count: draftCreatorHandles.length,
    });
    updatePreferences.mutate({
      selectedNicheSlugs: draftNicheSlugs,
      selectedCreatorHandles:
        draftCreatorHandles.length > 0 ? draftCreatorHandles : [],
    });
  };

  const viewModeCreatorsQuery = trpc.featured.accountsByNicheSlugs.useQuery(
    { slugs: serverNicheSlugs.length > 0 ? serverNicheSlugs : ["marketing-sales"] },
    { enabled: !isEditingInterests && serverNicheSlugs.length > 0 && serverCreatorHandles.length > 0 }
  );

  const viewModeCreatorMap = useMemo(() => {
    const map = new Map<
      string,
      { handle: string; displayName: string; profilePicUrl: string }
    >();
    const groups = viewModeCreatorsQuery.data?.groups ?? {};
    for (const creators of Object.values(groups)) {
      for (const c of creators) {
        if (!map.has(c.handle)) {
          map.set(c.handle, {
            handle: c.handle,
            displayName: c.displayName,
            profilePicUrl: c.profilePicUrl,
          });
        }
      }
    }
    return map;
  }, [viewModeCreatorsQuery.data]);

  const body = (
    <>
      {variant === "settings" && (
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Your Interests</h2>
          {!isEditingInterests && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={beginEdit}
              disabled={onboardingStateQuery.isLoading}
            >
              <Pencil className="mr-1.5 h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
      )}

      {variant === "page" && !isEditingInterests && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={beginEdit}
            disabled={onboardingStateQuery.isLoading}
          >
            <Pencil className="mr-1.5 h-3 w-3" />
            Edit
          </Button>
        </div>
      )}

      {variant === "settings" && (
        <p className="mb-4 text-xs text-muted-foreground">{SETTINGS_INTRO}</p>
      )}

        {isEditingInterests ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Niches ({draftNicheSlugs.length}/{MAX_NICHES})
                </h3>
                <NicheSelectGrid
                  selectedNicheSlugs={draftNicheSlugs}
                  onToggle={toggleDraftNiche}
                  heading={null}
                  hideCounter
                />
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Creators ({draftCreatorHandles.length}/{MAX_CREATORS})
                </h3>
                <CreatorSelectGrid
                  groupedCreators={creatorsQuery.data?.groups ?? {}}
                  nicheSlugs={draftNicheSlugs}
                  selectedCreatorHandles={draftCreatorHandles}
                  onToggle={toggleDraftCreator}
                  isLoading={creatorsQuery.isLoading}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-border pt-4">
              <Button
                onClick={handleSaveInterests}
                disabled={
                  updatePreferences.isPending || draftNicheSlugs.length === 0
                }
              >
                {updatePreferences.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={cancelEdit}
                disabled={updatePreferences.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Niches
              </h3>
              {serverNicheSlugs.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                  No niches selected yet. Click Edit to pick some.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {serverNicheSlugs.map((slug) => {
                    const niche = ONBOARDING_NICHES_BY_SLUG.get(slug);
                    return (
                      <span
                        key={slug}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-foreground"
                      >
                        <span>{niche?.emoji ?? "•"}</span>
                        <span>{niche?.name ?? slug}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Creators
              </h3>
              {serverCreatorHandles.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                  No creators picked yet. Your sidebar will show
                  niche-based suggestions instead.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {serverCreatorHandles.map((handle) => {
                    const meta = viewModeCreatorMap.get(handle);
                    const initials = handle.slice(0, 2).toUpperCase();
                    return (
                      <div
                        key={handle}
                        className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1"
                      >
                        <div className="h-6 w-6 overflow-hidden rounded-full border border-border bg-muted">
                          {meta?.profilePicUrl ? (
                            <img
                              src={meta.profilePicUrl}
                              alt={`@${handle}`}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-muted-foreground">
                              {initials}
                            </div>
                          )}
                        </div>
                        <span className="font-mono text-xs">@{handle}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
    </>
  );

  return (
    <div
      className={
        variant === "settings"
          ? "rounded-lg border border-border/50 bg-card p-5"
          : "rounded-lg border border-border/50 bg-card p-5"
      }
    >
      {body}
    </div>
  );
}
