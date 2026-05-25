import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Compass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { formatNumber } from "@/components/InlineWorkflow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type DiscoveryCreator =
  inferRouterOutputs<AppRouter>["discovery"]["runFullPipeline"]["creators"][number];

const MAX_DESCRIPTION_LENGTH = 500;

function formatEngagementRate(rate: number): string {
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

function DiscoveryResultCard({ creator }: { creator: DiscoveryCreator }) {
  const showEngagement =
    creator.engagementRate != null && creator.engagementRate > 0;

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
          onClick={() => {}}
        >
          Spy Now
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Discovery() {
  const [description, setDescription] = useState("");
  const [results, setResults] = useState<DiscoveryCreator[] | null>(null);

  const runPipeline = trpc.discovery.runFullPipeline.useMutation({
    onSuccess: (data) => {
      setResults(data.creators);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const trimmed = description.trim();
  const canSubmit = trimmed.length >= 10 && !runPipeline.isPending;
  const isLoading = runPipeline.isPending;
  const showResults = !isLoading && results != null && results.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setResults(null);
    runPipeline.mutate({ description: trimmed });
  };

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20">
            <Compass className="h-6 w-6 text-sky-400" />
          </div>
          <h1 className="text-2xl font-bold">Discovery</h1>
        </div>
        <p className="text-muted-foreground">
          Describe your niche in plain language. We will find 10 creators worth studying in your space.
        </p>
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
            disabled={isLoading}
            className="resize-y min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </p>
        </div>

        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Finding creators...
            </>
          ) : (
            "Find Creators"
          )}
        </Button>
      </div>

      {isLoading ? (
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
