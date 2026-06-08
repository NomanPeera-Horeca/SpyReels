import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Check, Loader2 } from "lucide-react";

const MAX_LENGTH = 1000;

export function BusinessPersonalizationSection() {
  const [businessDescription, setBusinessDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [seededFromDiscovery, setSeededFromDiscovery] = useState(false);

  const onboardingStateQuery = trpc.onboarding.getState.useQuery();

  const savedBusinessEmpty =
    onboardingStateQuery.isSuccess &&
    !(onboardingStateQuery.data.businessDescription?.trim() ?? "");

  const discoverySeedQuery =
    trpc.preferences.latestDiscoveryBusinessDescription.useQuery(undefined, {
      enabled: !hydrated && savedBusinessEmpty,
    });

  const utils = trpc.useUtils();
  const updateProfile = trpc.preferences.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Business profile saved");
      setSeededFromDiscovery(false);
      onboardingStateQuery.refetch();
      utils.onboarding.getState.invalidate();
    },
    onError: (err) =>
      toast.error(err.message || "Failed to save business profile"),
  });

  useEffect(() => {
    if (hydrated || onboardingStateQuery.isLoading) return;

    const savedBusiness =
      onboardingStateQuery.data?.businessDescription?.trim() ?? "";
    const savedAudience = onboardingStateQuery.data?.targetAudience ?? "";

    setTargetAudience(savedAudience);

    if (savedBusiness) {
      setBusinessDescription(savedBusiness);
      setHydrated(true);
      return;
    }

    if (discoverySeedQuery.isLoading || discoverySeedQuery.isFetching) return;

    const seed = discoverySeedQuery.data?.trim();
    if (seed) {
      setBusinessDescription(seed);
      setSeededFromDiscovery(true);
    }
    setHydrated(true);
  }, [
    hydrated,
    onboardingStateQuery.isLoading,
    onboardingStateQuery.data,
    discoverySeedQuery.isLoading,
    discoverySeedQuery.isFetching,
    discoverySeedQuery.data,
  ]);

  const serverBusiness =
    onboardingStateQuery.data?.businessDescription?.trim() ?? "";
  const serverAudience =
    onboardingStateQuery.data?.targetAudience?.trim() ?? "";
  const draftBusiness = businessDescription.trim();
  const draftAudience = targetAudience.trim();
  const hasChanges =
    draftBusiness !== serverBusiness || draftAudience !== serverAudience;

  const handleSave = () => {
    updateProfile.mutate({
      businessDescription: draftBusiness || null,
      targetAudience: draftAudience || null,
    });
  };

  const isLoading =
    onboardingStateQuery.isLoading ||
    (!hydrated && savedBusinessEmpty && discoverySeedQuery.isLoading);

  return (
    <div className="rounded-lg border border-border/50 bg-card p-5 text-card-foreground">
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Your Business</h2>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Tell us what you do and who you create for. SpyReels uses this to
        personalize Remake now scripts so drafts fit your offer and audience.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
              What does your business do?
            </label>
            <Textarea
              value={businessDescription}
              onChange={(e) =>
                setBusinessDescription(e.target.value.slice(0, MAX_LENGTH))
              }
              placeholder="Example: I sell online courses that help real estate agents get more listings."
              rows={4}
              maxLength={MAX_LENGTH}
              className="resize-y min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground text-right">
              {businessDescription.length}/{MAX_LENGTH}
            </p>
            {seededFromDiscovery && (
              <p className="text-xs text-muted-foreground">
                Pre-filled from your latest Discovery search. Edit if needed,
                then save.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
              Who do you create content for?
            </label>
            <Textarea
              value={targetAudience}
              onChange={(e) =>
                setTargetAudience(e.target.value.slice(0, MAX_LENGTH))
              }
              placeholder="Example: New agents in their first two years who struggle with lead generation."
              rows={4}
              maxLength={MAX_LENGTH}
              className="resize-y min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground text-right">
              {targetAudience.length}/{MAX_LENGTH}
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateProfile.isPending}
            >
              {updateProfile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
