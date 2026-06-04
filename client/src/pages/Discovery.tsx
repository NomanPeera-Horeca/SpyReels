import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  BadgeCheck,
  Compass,
  ExternalLink,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { formatNumber } from "@/components/InlineWorkflow";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import Tooltip from "@/components/Tooltip";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";
import { LOADING_TIPS } from "@/data/loadingTips";
import { cn } from "@/lib/utils";

type DiscoverySearchResult =
  inferRouterOutputs<AppRouter>["discovery"]["search"];
type ViralReel = DiscoverySearchResult["viralReels"][number];
type ViralTier = ViralReel["viralTier"];

const MAX_DESCRIPTION_LENGTH = 500;
const MIN_DESCRIPTION_LENGTH = 20;

const DISCOVERY_SEARCH_TIPS: readonly string[] = [
  "We map your description to a niche, then search real Instagram hashtags for recent Reels.",
  "Viral score blends reach (views vs followers) with engagement on each reel.",
  "Reels need at least 5,000 views and 3x reach vs the creator's followers to rank.",
  "Trending through Explosive tiers help you spot breakout formats fast.",
  "Creators behind the reels can be added to your library for full spy sessions.",
  ...LOADING_TIPS.slice(0, 8),
];

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tierBadgeClass(tier: ViralTier): string {
  switch (tier) {
    case "Explosive":
      return "bg-red-500/20 text-red-300 border-red-500/40";
    case "Viral":
      return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "Strong":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "Healthy":
      return "bg-green-500/20 text-green-300 border-green-500/40";
    case "Trending":
    default:
      return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}

function DiscoverReelCard({ reel }: { reel: ViralReel }) {
  const captionPreview =
    reel.caption.trim().length > 0 ? reel.caption.trim() : "(no caption)";

  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="p-0 flex flex-col h-full">
        <div className="relative aspect-[9/16] max-h-[320px] w-full bg-black">
          <DashboardReelGridMedia
            thumbnailUrl={reel.thumbnailUrl}
            videoUrl={reel.videoUrl}
            className="absolute inset-0 h-full w-full"
            size="compact"
          />
          <div className="absolute top-2 left-2 z-10">
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                tierBadgeClass(reel.viralTier)
              )}
            >
              {reel.viralTier}
            </span>
          </div>
        </div>

        <div className="p-3 flex flex-col gap-2 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <p className="font-semibold truncate text-sm">@{reel.owner.username}</p>
            {reel.owner.isVerified ? (
              <BadgeCheck
                className="h-4 w-4 shrink-0 text-sky-400"
                aria-label="Verified"
              />
            ) : null}
          </div>
          {reel.owner.fullName ? (
            <p className="text-xs text-muted-foreground truncate">
              {reel.owner.fullName}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {formatNumber(reel.views)} views · {formatNumber(reel.likes)} likes ·{" "}
            {formatNumber(reel.comments)} comments
          </p>
          <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">
            {captionPreview}
          </p>
          <div className="mt-auto flex flex-col gap-2 pt-1">
            <a
              href={reel.reelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open on Instagram
              <ExternalLink className="h-3 w-3" />
            </a>
            <Tooltip content="Coming next">
              <span className="inline-block w-full">
                <Button type="button" variant="secondary" className="w-full" disabled>
                  Remake in my voice
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type DerivedCreator = ViralReel["owner"];

function deriveUniqueCreators(reels: ViralReel[]): DerivedCreator[] {
  const byUsername = new Map<string, DerivedCreator>();
  for (const reel of reels) {
    const key = reel.owner.username.toLowerCase();
    if (!byUsername.has(key)) {
      byUsername.set(key, reel.owner);
    }
  }
  return [...byUsername.values()];
}

function CreatorBehindReelCard({
  owner,
  onAddToLibrary,
  isPending,
}: {
  owner: DerivedCreator;
  onAddToLibrary: (handle: string) => void;
  isPending: boolean;
}) {
  const avatarSrc = owner.profilePicUrl?.trim() || null;

  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 rounded-full overflow-hidden bg-muted border border-border">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
              @
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="font-medium text-sm truncate">@{owner.username}</p>
            {owner.isVerified ? (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            ) : null}
          </div>
          {owner.fullName ? (
            <p className="text-xs text-muted-foreground truncate">{owner.fullName}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {formatNumber(owner.followers)} followers
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isPending}
          onClick={() => onAddToLibrary(owner.username)}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Add to library"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function DiscoverySearchLoading() {
  const tips = useMemo(() => shuffle(DISCOVERY_SEARCH_TIPS), []);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const tipIndexRef = useRef(0);

  useEffect(() => {
    const rotate = setInterval(() => {
      setTipVisible(false);
      const fadeTimer = setTimeout(() => {
        tipIndexRef.current = (tipIndexRef.current + 1) % tips.length;
        setTipIndex(tipIndexRef.current);
        setTipVisible(true);
      }, 300);
      return () => clearTimeout(fadeTimer);
    }, 7000);
    return () => clearInterval(rotate);
  }, [tips.length]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center rounded-xl border border-border/60 bg-muted/20 w-full">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="space-y-2 max-w-md px-4">
        <p className="font-medium">Finding viral reels in your niche...</p>
        <p className="text-sm text-muted-foreground">
          This usually takes 10 to 20 seconds. We are routing your niche and searching
          hashtags on Instagram.
        </p>
        <div
          className={cn(
            "mt-4 rounded-lg border border-border/50 bg-background/60 px-4 py-3 text-left transition-opacity duration-300",
            tipVisible ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                While you wait
              </p>
              <p className="text-sm text-foreground/90">{tips[tipIndex]}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Discovery() {
  if (!isDiscoveryV1Enabled) {
    return null;
  }

  const [, setLocation] = useLocation();
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<DiscoverySearchResult | null>(null);
  const [pendingHandle, setPendingHandle] = useState<string | null>(null);

  const searchMutation = trpc.discovery.search.useMutation({
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err) => {
      toast.error(err.message);
      setResult(null);
    },
  });

  const startScrape = trpc.scrape.start.useMutation({
    onSuccess: (data) => {
      setPendingHandle(null);
      if ("redirect" in data && data.redirect === "featured") {
        setLocation(
          `/dashboard?featuredAccountId=${data.featuredAccountId}&from=discovery`
        );
        return;
      }
      setLocation(`/scraping?jobId=${data.jobId}`);
    },
    onError: (err) => {
      setPendingHandle(null);
      toast.error(err.message);
    },
  });

  const trimmed = description.trim();
  const isSearching = searchMutation.isPending;
  const submitEnabled =
    trimmed.length >= MIN_DESCRIPTION_LENGTH && !isSearching;

  const uniqueCreators = useMemo(
    () => (result ? deriveUniqueCreators(result.viralReels) : []),
    [result]
  );

  const handleSubmit = () => {
    if (!submitEnabled) return;
    setResult(null);
    searchMutation.mutate({ businessDescription: trimmed });
  };

  const handleAddToLibrary = (username: string) => {
    const handle = username.replace(/^@/, "").trim();
    if (!handle) return;
    setPendingHandle(handle);
    startScrape.mutate({ handle, timeframeDays: 90 });
  };

  const showResults = result != null && !isSearching;
  const reelCount = result?.viralReels.length ?? 0;

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20">
            <Compass className="h-6 w-6 text-sky-400" />
          </div>
          <h1 className="text-2xl font-bold">Discovery</h1>
        </div>
        <p className="text-muted-foreground">
          Describe your business in plain language. We find viral Reels in your niche
          and the creators behind them.
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
            "Find viral reels"
          )}
        </Button>
      </div>

      {isSearching ? <DiscoverySearchLoading /> : null}

      {showResults ? (
        <div className="space-y-8">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              Viral reels in {result.routedNiche || "your niche"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {reelCount} reel{reelCount === 1 ? "" : "s"} found
            </p>
          </div>

          {reelCount === 0 ? (
            <Card>
              <CardContent className="p-6 space-y-3 text-center">
                <p className="text-sm text-foreground/90">
                  No reels passed our viral filters this time. Try a more specific
                  description or a slightly different angle on your audience.
                </p>
                {result.hashtagFailures.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Some hashtags returned no results:{" "}
                    {result.hashtagFailures.map((h) => `#${h}`).join(", ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div
              className={cn(
                "grid gap-4",
                reelCount <= 3
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "sm:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {result.viralReels.map((reel) => (
                <DiscoverReelCard key={reel.shortcode} reel={reel} />
              ))}
            </div>
          )}

          {uniqueCreators.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Creators behind these reels</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {uniqueCreators.map((owner) => (
                  <CreatorBehindReelCard
                    key={owner.username}
                    owner={owner}
                    onAddToLibrary={handleAddToLibrary}
                    isPending={
                      startScrape.isPending && pendingHandle === owner.username
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
