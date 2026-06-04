import { useState, useCallback } from "react";
import { Compass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatNumber } from "@/components/InlineWorkflow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";

type DiscoveryCreator = {
  rankPosition: number;
  instagramHandle: string;
  followerCount: number;
  engagementRate: number;
  nicheFitScore: number;
  whyMatchSummary: string;
};

type FlowState = "idle" | "routing" | "running-pipeline" | "success";

const MAX_DESCRIPTION_LENGTH = 500;
const CONFIDENCE_THRESHOLD = 0.65;

function formatEngagementRate(rate: number): string {
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

function formatQuotaResetDate(iso: string): string {
  const date = new Date(iso);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return `Resets ${formatted}`;
}

function QuotaCounter() {
  const quotaQuery = trpc.discovery.getQuota.useQuery(undefined, {
    enabled: isDiscoveryV1Enabled,
  });

  if (quotaQuery.isLoading) {
    return <Skeleton className="h-4 w-72 max-w-full" />;
  }

  if (quotaQuery.isError || !quotaQuery.data) {
    return null;
  }

  const { used, limit, resetsAt } = quotaQuery.data;

  return (
    <p className="text-sm text-muted-foreground">
      {used} of {limit} discovery searches used this month ({formatQuotaResetDate(resetsAt)})
    </p>
  );
}

function DiscoveryResultCard({ creator }: { creator: DiscoveryCreator }) {
  const [, setLocation] = useLocation();

  const showEngagement =
    creator.engagementRate != null && creator.engagementRate > 0;

  const handleSpyNow = () => {
    setLocation(
      `/research?handle=${encodeURIComponent(creator.instagramHandle)}&source=discovery&timeframe=365d&autorun=true`
    );
  };

  return (
    <Card className="h-full">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {creator.rankPosition} of 10
            </p>
            <p className="text-lg font-semibold truncate">
              @{creator.instagramHandle}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {creator.nicheFitScore.toFixed(2)} match
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground space-y-0.5">
          <p>{formatNumber(creator.followerCount)} followers</p>
          {showEngagement ? (
            <p>{formatEngagementRate(creator.engagementRate)} engagement</p>
          ) : null}
        </div>

        <p className="text-sm text-foreground/90 line-clamp-2">
          {creator.whyMatchSummary}
        </p>

        <Button
          type="button"
          variant="default"
          className="mt-auto w-full sm:w-auto"
          onClick={handleSpyNow}
        >
          Spy Now
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Discovery() {
  if (!isDiscoveryV1Enabled) {
    return null;
  }

  const utils = trpc.useUtils();
  const quotaQuery = trpc.discovery.getQuota.useQuery(undefined, {
    enabled: isDiscoveryV1Enabled,
  });

  const [description, setDescription] = useState("");
  const [results, setResults] = useState<DiscoveryCreator[] | null>(null);
  const [flowState, setFlowState] = useState<FlowState>("idle");

  const runPipeline = trpc.discovery.search.useMutation({
    onSuccess: () => {
      setResults([]);
      setFlowState("success");
      void utils.discovery.getQuota.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(err.message);
      setFlowState("idle");
    },
  });

  const routeNiche = trpc.discovery.routeNiche.useMutation({
    onError: (err) => {
      toast.error(err.message);
      setFlowState("idle");
    },
  });

  const startPipeline = useCallback(
    (desc: string) => {
      setResults(null);
      setFlowState("running-pipeline");
      runPipeline.mutate({ businessDescription: desc });
    },
    [runPipeline]
  );

  const trimmed = description.trim();
  const limitReached =
    quotaQuery.data != null && quotaQuery.data.used >= quotaQuery.data.limit;
  const isBusy = flowState === "routing" || flowState === "running-pipeline";

  const submitEnabled = trimmed.length >= 10 && !limitReached && !isBusy;

  const submitLabel = (() => {
    if (limitReached) return "Limit reached";
    if (flowState === "routing") return "Routing your niche...";
    if (flowState === "running-pipeline") {
      return "Finding creators... (60 to 90 seconds)";
    }
    return "Find Creators";
  })();

  const showPipelineLoading = flowState === "running-pipeline";
  const showResults =
    flowState === "success" && results != null && results.length > 0;

  const handleSubmit = () => {
    if (!submitEnabled) return;
    setResults(null);
    setFlowState("routing");
    routeNiche.mutate(
      { description: trimmed },
      {
        onSuccess: (result) => {
          if (result.confidence >= CONFIDENCE_THRESHOLD) {
            startPipeline(trimmed);
            return;
          }
          toast.error(
            "Your description is a bit ambiguous. Try adding more detail about what you make and who it is for."
          );
          setFlowState("idle");
        },
      }
    );
  };

  const formDisabled = isBusy;

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20">
            <Compass className="h-6 w-6 text-sky-400" />
          </div>
          <h1 className="text-2xl font-bold">Discovery</h1>
        </div>
        <p className="text-muted-foreground">
          Describe your niche in plain language. We will find 10 creators worth studying in your space.
        </p>
        <QuotaCounter />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
            }
            placeholder="Describe your niche in plain language. What do you make and who is it for?"
            rows={5}
            maxLength={MAX_DESCRIPTION_LENGTH}
            disabled={formDisabled}
            className="resize-y min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </p>
        </div>

        <Button type="button" onClick={handleSubmit} disabled={!submitEnabled}>
          {isBusy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {submitLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>

      {showPipelineLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center rounded-xl border border-border/60 bg-muted/20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="space-y-2 max-w-md">
            <p className="font-medium">
              Finding creators in your niche... (60 to 90 seconds)
            </p>
            <p className="text-sm text-muted-foreground">
              Finding creators in your niche... This takes 60 to 90 seconds. We are routing your niche,
              searching Instagram, and scoring the best matches.
            </p>
          </div>
        </div>
      ) : null}

      {showResults ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Top creators for your niche</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {results.map((creator) => (
              <DiscoveryResultCard
                key={creator.rankPosition}
                creator={creator}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
