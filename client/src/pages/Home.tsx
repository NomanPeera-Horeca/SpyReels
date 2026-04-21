import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { usePostHog } from "@posthog/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Film,
  Search,
  Clock,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Lock,
  Users,
  ImageIcon,
  BadgeCheck,
  ExternalLink,
} from "lucide-react";
import { useUsageGate } from "@/hooks/useUsageGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";

function formatCount(n: number): string {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function Home() {
  const posthog = usePostHog();
  const [handle, setHandle] = useState("");
  const [timeframe, setTimeframe] = useState("30");
  const [, setLocation] = useLocation();
  const [debouncedHandle, setDebouncedHandle] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce handle input - only query after 800ms of no typing and min 2 chars
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const cleanHandle = handle.replace(/^@/, "").trim();
    if (cleanHandle.length < 2) {
      setDebouncedHandle("");
      return;
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedHandle(cleanHandle);
    }, 800);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [handle]);

  const profileQuery = trpc.scrape.profilePreview.useQuery(
    { handle: debouncedHandle },
    {
      enabled: debouncedHandle.length >= 2,
      retry: false,
      staleTime: 60_000,
    }
  );

  const profile = profileQuery.data;
  const isLoadingProfile = profileQuery.isFetching;
  const profileFound = profile?.found === true;
  const profileError = profile?.found === false ? profile.error : null;

  const scrapeGate = useUsageGate("scrapeCount");

  const startScrape = trpc.scrape.start.useMutation({
    onSuccess: data => {
      // Route to the dedicated scraping progress page; the toast would be
      // redundant on top of the full-page experience there.
      setLocation(`/scraping?jobId=${data.jobId}`);
    },
    onError: error => {
      toast.error("Failed to start scraping", {
        description: error.message,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) {
      toast.error("Please enter an Instagram handle");
      return;
    }
    if (profile?.found && profile.isPrivate) {
      toast.error("This account is private and cannot be scraped.");
      return;
    }
    if (!scrapeGate.allowed) {
      toast.error(
        `Scrape limit reached (${scrapeGate.used}/${scrapeGate.limit})`,
        {
          description: "Upgrade your plan for more scrapes.",
          action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
        }
      );
      return;
    }
    posthog?.capture("research_started", {
      handle: handle.replace(/^@/, "").trim(),
      timeframe_days: parseInt(timeframe),
    });
    startScrape.mutate({
      handle: handle.trim(),
      timeframeDays: parseInt(timeframe),
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-0 pt-4 sm:pt-8 md:pt-16">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Research Viral Reels
          </h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Enter a public Instagram handle and select a timeframe to collect all
          Reels data including views, likes, comments, and more.
        </p>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-card-foreground">
            New Research Job
          </CardTitle>
          <CardDescription>
            Provide the account details to start collecting Reels data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="handle"
                className="text-sm font-medium text-card-foreground"
              >
                Instagram Handle
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="handle"
                  placeholder="e.g. natgeo"
                  value={handle}
                  onChange={e => setHandle(e.target.value)}
                  className="pl-10 h-11 bg-background"
                />
                {isLoadingProfile && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!isLoadingProfile && profileFound && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                )}
                {!isLoadingProfile && profileError && (
                  <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the username without the @ symbol. The account must be
                public.
              </p>
            </div>

            {/* Profile Preview Card */}
            {profileFound && profile.found && (
              <div className="rounded-lg border border-border bg-background p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-start gap-4">
                  {/* Profile Picture */}
                  <div className="shrink-0">
                    {profile.profilePicUrl ? (
                      <img
                        src={profile.profilePicUrl}
                        alt={profile.username}
                        className="w-16 h-16 rounded-full object-cover border-2 border-border"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Profile Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-foreground truncate">
                        {profile.username}
                      </h3>
                      {profile.isVerified && (
                        <BadgeCheck className="h-4 w-4 text-blue-500 shrink-0" />
                      )}
                      {profile.isPrivate && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 border-orange-500/50 text-orange-400"
                        >
                          <Lock className="mr-0.5 h-2.5 w-2.5" />
                          Private
                        </Badge>
                      )}
                    </div>

                    {profile.fullName && (
                      <p className="text-xs text-muted-foreground mb-1">
                        {profile.fullName}
                      </p>
                    )}

                    {profile.category && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 mb-1.5"
                      >
                        {profile.category}
                      </Badge>
                    )}

                    {profile.biography && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                        {profile.biography}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <p className="font-bold text-foreground">
                          {formatCount(profile.postCount)}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          posts
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-foreground">
                          {formatCount(profile.followerCount)}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          followers
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-foreground">
                          {formatCount(profile.followingCount)}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          following
                        </p>
                      </div>
                      {profile.externalUrl && (
                        <a
                          href={profile.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline ml-auto"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span className="text-[10px] truncate max-w-[120px]">
                            {profile.externalUrl.replace(/^https?:\/\//, "")}
                          </span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {profile.isPrivate && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs text-orange-400 flex items-center gap-1.5">
                      <Lock className="h-3 w-3" />
                      This account is private. Only public accounts can be
                      scraped.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Profile Error */}
            {profileError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 animate-in fade-in duration-200">
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <XCircle className="h-3 w-3 shrink-0" />
                  {profileError}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label
                htmlFor="timeframe"
                className="text-sm font-medium text-card-foreground"
              >
                Timeframe
              </Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="h-11 bg-background">
                  <Clock className="h-4 w-4 text-muted-foreground mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Reels posted within this window will be collected.
              </p>
            </div>

            {!scrapeGate.isLoading && !scrapeGate.allowed && (
              <UpgradePrompt
                action="scrapeCount"
                used={scrapeGate.used}
                limit={scrapeGate.limit}
                planRequired={scrapeGate.planRequired}
                variant="inline"
              />
            )}

            {!scrapeGate.isLoading &&
              scrapeGate.allowed &&
              scrapeGate.limit > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {scrapeGate.used}/{scrapeGate.limit} scrapes used this month
                </p>
              )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-base font-medium"
              disabled={
                startScrape.isPending ||
                !handle.trim() ||
                (profile?.found === true && profile.isPrivate) ||
                !scrapeGate.allowed
              }
            >
              {startScrape.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  Start Research
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Research",
            desc: "Collect all Reels metadata from any public account",
          },
          {
            label: "Analyze",
            desc: "Sort by views, likes, comments, or date instantly",
          },
          {
            label: "Transcribe",
            desc: "Get full transcripts with hook analysis for any Reel",
          },
        ].map(item => (
          <div
            key={item.label}
            className="rounded-lg border border-border/50 bg-card/50 p-4"
          >
            <p className="text-sm font-medium text-card-foreground mb-1">
              {item.label}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
