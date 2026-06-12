import { useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";

type CreatorDiscoveryResult =
  inferRouterOutputs<AppRouter>["creatorDiscovery"]["getSearch"];
type CreatorDiscoveryJobStatus =
  inferRouterOutputs<AppRouter>["creatorDiscovery"]["jobStatus"];
type RecentCreatorDiscoverySearch =
  inferRouterOutputs<AppRouter>["creatorDiscovery"]["recentSearches"][number];
type RankedCreator = CreatorDiscoveryResult["rankedCreators"][number];

const MAX_DESCRIPTION_LENGTH = 1000;
const MIN_DESCRIPTION_LENGTH = 20;

export default function CreatorDiscovery() {
  if (!isDiscoveryV1Enabled) {
    return null;
  }

  const [description, setDescription] = useState("");
  const [result, setResult] = useState<CreatorDiscoveryResult | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const recentSearchesQuery = trpc.creatorDiscovery.recentSearches.useQuery();
  const jobStatusQuery = trpc.creatorDiscovery.jobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: activeJobId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 2500;
      },
    }
  );

  useEffect(() => {
    const job = jobStatusQuery.data;
    if (!job || activeJobId == null) return;

    if (job.partialJson) {
      setResult(job.partialJson);
    }

    if (job.status === "completed") {
      setActiveJobId(null);
      void recentSearchesQuery.refetch();
    } else if (job.status === "failed") {
      setActiveJobId(null);
      setResult(null);
      toast.error(job.errorMessage?.trim() || "Creator discovery search failed");
    }
  }, [jobStatusQuery.data, activeJobId, recentSearchesQuery]);

  const searchMutation = trpc.creatorDiscovery.search.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setResult(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setActiveJobId(null);
      setResult(null);
    },
  });

  const trimmed = description.trim();
  const jobStatus = jobStatusQuery.data;
  const isJobRunning =
    activeJobId != null &&
    jobStatus?.status !== "completed" &&
    jobStatus?.status !== "failed";
  const isSearching = searchMutation.isPending || isJobRunning;
  const submitEnabled = trimmed.length >= MIN_DESCRIPTION_LENGTH && !isSearching;

  const handleSubmit = () => {
    if (!submitEnabled) return;
    setActiveJobId(null);
    setResult(null);
    searchMutation.mutate({ businessDescription: trimmed });
  };

  const rankedCreators: RankedCreator[] = result?.rankedCreators ?? [];

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
            <Users className="h-6 w-6 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold">Discover Creators</h1>
        </div>
        <p className="text-muted-foreground">
          Describe your business in plain language. We find peer creators in your
          niche who are already winning with content like yours.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
            }
            placeholder="What do you make or sell, and who is it for? Be specific so we can route your niche."
            rows={5}
            maxLength={MAX_DESCRIPTION_LENGTH}
            disabled={isSearching}
            className="resize-y min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length}/{MAX_DESCRIPTION_LENGTH}
            {trimmed.length > 0 && trimmed.length < MIN_DESCRIPTION_LENGTH
              ? ` (${MIN_DESCRIPTION_LENGTH} character minimum)`
              : ""}
          </p>
        </div>

        <Button type="button" onClick={handleSubmit} disabled={!submitEnabled}>
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Searching...
            </>
          ) : (
            "Find peer creators"
          )}
        </Button>
      </div>

      {(isSearching || jobStatus) && (
        <p className="text-sm text-muted-foreground font-mono">
          status={jobStatus?.status ?? (searchMutation.isPending ? "starting" : "—")}
          {" · "}
          topics={jobStatus?.topicsSearched ?? 0}/{jobStatus?.topicsTotal ?? 0}
          {" · "}
          creatorsFound={jobStatus?.creatorsFound ?? 0}
        </p>
      )}

      {rankedCreators.length > 0 ? (
        <ul className="space-y-1 font-mono text-sm">
          {rankedCreators.map((creator) => (
            <li key={creator.owner.username}>
              #{creator.rank ?? "?"} @{creator.owner.username} score=
              {creator.bestReel.viralScore.toFixed(1)} tier=
              {creator.bestReel.tier}
            </li>
          ))}
        </ul>
      ) : isSearching ? (
        <p className="text-sm text-muted-foreground">Waiting for creators...</p>
      ) : null}
    </div>
  );
}
