import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePostHog } from "@posthog/react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import {
  Eye,
  Heart,
  MessageCircle,
  Calendar as CalendarIcon,
  ExternalLink,
  FileText,
  Loader2,
  Download,
  ArrowLeft,
  Film,
  Clock,
  Sheet,
  TrendingUp,
  Wand2,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  Inbox,
  PenLine,
  ArrowRight,
  Users,
  Grid3X3,
  List,
  X,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InlineWorkflow,
  formatNumber,
  formatDuration,
  formatPostedTime,
} from "@/components/InlineWorkflow";
import { useUsageGate } from "@/hooks/useUsageGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useAuth } from "@/_core/hooks/useAuth";
import { normalizeAnalyticsHandle } from "@/lib/utils";
import Tooltip from "@/components/Tooltip";

type SortOption =
  | "views_desc"
  | "likes_desc"
  | "comments_desc"
  | "engagement_desc"
  | "date_desc"
  | "date_asc";

type ViewMode = "list" | "grid";

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ReactNode }[] = [
  { value: "views_desc", label: "Highest Views", icon: <Eye className="h-3.5 w-3.5" /> },
  { value: "likes_desc", label: "Highest Likes", icon: <Heart className="h-3.5 w-3.5" /> },
  { value: "comments_desc", label: "Highest Comments", icon: <MessageCircle className="h-3.5 w-3.5" /> },
  { value: "engagement_desc", label: "Highest Engagement Rate", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { value: "date_desc", label: "Date (Newest)", icon: <CalendarIcon className="h-3.5 w-3.5" /> },
  { value: "date_asc", label: "Date (Oldest)", icon: <CalendarIcon className="h-3.5 w-3.5" /> },
];

type BadgeConfidence = "high" | "medium" | "low";

function toReadableNiche(slug: string | null | undefined): string {
  if (!slug) return "Unknown niche";
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Strip @ for display; avoid placeholder "owner" if scraper left bad job.handle — fall back to first reel. */
function stripAtHandle(h: string | undefined | null) {
  return (h ?? "").replace(/^@/, "").trim();
}

function AiBadge({
  nicheSlug,
  confidence,
}: {
  nicheSlug: string;
  confidence: BadgeConfidence;
}) {
  const confidenceStyles: Record<BadgeConfidence, string> = {
    high: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    medium: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    low: "border-zinc-400/40 bg-zinc-500/15 text-zinc-300",
  };
  return (
    <Tooltip content={`AI-classified niche with ${confidence} confidence`}>
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${confidenceStyles[confidence]}`}
      >
        <Sparkles className="h-3 w-3" />
        AI: {toReadableNiche(nicheSlug)} ({confidence})
      </span>
    </Tooltip>
  );
}

export default function Dashboard() {
  const posthog = usePostHog();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const jobId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const id = params.get("jobId");
    return id ? parseInt(id, 10) : null;
  }, [searchString]);
  const featuredAccountId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const id = params.get("featuredAccountId");
    return id ? parseInt(id, 10) : null;
  }, [searchString]);
  const fromPage = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("from") || null;
  }, [searchString]);
  const [sortBy, setSortBy] = useState<SortOption>("engagement_desc");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const setViewModeTracked = useCallback(
    (next: ViewMode) => {
      setViewMode((prev) => {
        if (prev === next) return prev;
        posthog?.capture("view_toggled", { mode: next });
        return next;
      });
    },
    [posthog]
  );

  const prevJobStatusRef = useRef<string | undefined>(undefined);
  const prevHasCompletedFirstSpyRef = useRef<boolean | undefined>(undefined);
  /** Ensures `first_spy_completed` fires at most once per browser session (milestone, not per job). */
  const firstSpyMilestoneLoggedRef = useRef(false);
  const [expandedReelId, setExpandedReelId] = useState<number | null>(null);
  const [showSheetsDialog, setShowSheetsDialog] = useState(false);
  const [sheetsEmail, setSheetsEmail] = useState("");

  const sheetsAvailable = trpc.export.sheetsAvailable.useQuery();
  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";
  const utils = trpc.useUtils();
  const billingSubscriptionQuery = trpc.billing.subscription.useQuery(undefined, {
    enabled: !!jobId,
  });
  const ensureDemoJob = trpc.featured.ensureDemoJob.useMutation();
  const [featuredResolveError, setFeaturedResolveError] = useState<string | null>(null);
  const [featuredResolveNotFound, setFeaturedResolveNotFound] = useState(false);
  const [featuredResolveKey, setFeaturedResolveKey] = useState(0);

  const resolveFeaturedJob = useCallback(async () => {
    if (!featuredAccountId || jobId) return;
    setFeaturedResolveError(null);
    setFeaturedResolveNotFound(false);
    try {
      const resolved = await ensureDemoJob.mutateAsync({ featuredAccountId });
      setLocation(`/dashboard?jobId=${resolved.jobId}`, { replace: true });
    } catch (error: any) {
      const code = error?.data?.code;
      if (code === "NOT_FOUND") {
        setFeaturedResolveNotFound(true);
        setFeaturedResolveError(
          error?.message || "That featured creator is no longer available."
        );
        return;
      }
      setFeaturedResolveError(
        error?.message || "Could not load featured creator reels right now."
      );
    }
  }, [ensureDemoJob, featuredAccountId, jobId, setLocation]);

  useEffect(() => {
    if (!featuredAccountId || jobId) return;
    resolveFeaturedJob();
  }, [featuredAccountId, jobId, featuredResolveKey, resolveFeaturedJob]);

  // Usage gates for feature gating
  const transcribeGate = useUsageGate("transcribeCount");
  const exportGate = useUsageGate("exportCount");

  const jobQuery = trpc.scrape.status.useQuery(
    { jobId: jobId! },
    {
      enabled: !!jobId,
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.status === "running" || data?.status === "pending" ? 2000 : false;
      },
    }
  );

  useEffect(() => {
    const j = jobQuery.data;
    const status = j?.status;
    const prevStatus = prevJobStatusRef.current;
    const transitionedToCompleted =
      status === "completed" &&
      prevStatus !== undefined &&
      prevStatus !== "completed";

    if (transitionedToCompleted && j && !j.isDemo) {
      const hadPriorFirstSpyComplete = prevHasCompletedFirstSpyRef.current === true;
      if (!hadPriorFirstSpyComplete && !firstSpyMilestoneLoggedRef.current) {
        posthog?.capture("first_spy_completed", {
          handle: normalizeAnalyticsHandle(j.handle),
          niche_slug: j.classifiedNicheSlug ?? null,
          job_id: j.id,
        });
        firstSpyMilestoneLoggedRef.current = true;
      }
    }

    prevJobStatusRef.current = status;
    prevHasCompletedFirstSpyRef.current = user?.hasCompletedFirstSpy ?? false;
  }, [jobQuery.data, user?.hasCompletedFirstSpy, posthog]);

  const job = jobQuery.data;

  const featuredHandleContext = trpc.featured.accountContextByHandle.useQuery(
    { handle: job?.handle ?? "" },
    { enabled: Boolean(jobId && job?.handle && job.status === "completed") }
  );

  const nicheSlugForSidebar = useMemo(() => {
    if (!job || job.status !== "completed") return null;
    if (job.classifiedNicheSlug) return job.classifiedNicheSlug;
    if (job.isDemo && featuredHandleContext.data?.nicheSlug) {
      return featuredHandleContext.data.nicheSlug;
    }
    return null;
  }, [job, featuredHandleContext.data]);

  const sidebarNicheLabel = useMemo(() => {
    if (!job || job.status !== "completed") return "";
    if (job.classifiedNicheSlug) return toReadableNiche(job.classifiedNicheSlug);
    if (job.isDemo && featuredHandleContext.data?.nicheName) {
      return featuredHandleContext.data.nicheName;
    }
    return "";
  }, [job, featuredHandleContext.data]);

  const canQueryRelated =
    Boolean(nicheSlugForSidebar) &&
    !!job &&
    job.status === "completed" &&
    featuredHandleContext.isFetched;

  const relatedCreatorsQuery = trpc.featured.relatedCreators.useQuery(
    {
      nicheSlug: nicheSlugForSidebar!,
      excludeAccountId: featuredHandleContext.data?.featuredAccountId ?? undefined,
      limit: 5,
    },
    { enabled: canQueryRelated }
  );

  const billingPlan = billingSubscriptionQuery.data?.plan ?? "free";
  const hideUpgradeSidebarPanel = billingPlan === "business" || billingPlan === "agency";
  const jobComplete = job?.status === "completed";

  const reelsQuery = trpc.reels.list.useQuery(
    { jobId: jobId! },
    {
      enabled: !!jobId && jobQuery.data?.status === "completed",
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data?.reels?.some((r: any) => r.transcription?.status === "processing")) {
          return 3000;
        }
        return false;
      },
    }
  );

  const [pendingTranscriptions, setPendingTranscriptions] = useState<Set<number>>(new Set());

  const reelsData = reelsQuery.data?.reels || [];
  const followerCount = reelsQuery.data?.followerCount || 0;

  /** Real IG handle for display; if job.handle is a bad placeholder, use first reel's owner. */
  const displayScrapeHandle = useMemo(() => {
    const fromJob = stripAtHandle(job?.handle);
    if (fromJob && fromJob.toLowerCase() !== "owner") return fromJob;
    const first = reelsData[0] as { ownerUsername?: string } | undefined;
    const fromReel = stripAtHandle(first?.ownerUsername);
    if (fromReel) return fromReel;
    return fromJob;
  }, [job?.handle, reelsData]);

  const reelIds = useMemo(() => reelsData.map((r: any) => r.id), [reelsData]);
  const savedBatchQuery = trpc.saved.checkBatch.useQuery(
    { reelIds },
    { enabled: reelIds.length > 0 }
  );
  const savedMap = savedBatchQuery.data || {};

  const toggleSave = trpc.saved.toggle.useMutation({
    onSuccess: (data) => {
      utils.saved.checkBatch.invalidate();
      utils.saved.list.invalidate();
      toast.success(data.saved ? "Reel saved" : "Reel removed from saved");
    },
  });

  useEffect(() => {
    if (!reelsData.length || pendingTranscriptions.size === 0) return;
    const completedOrFailed = new Set<number>();
    for (const reel of reelsData) {
      if (
        pendingTranscriptions.has(reel.id) &&
        (reel.transcription?.status === "completed" || reel.transcription?.status === "failed")
      ) {
        completedOrFailed.add(reel.id);
      }
    }
    if (completedOrFailed.size > 0) {
      setPendingTranscriptions((prev) => {
        const next = new Set(prev);
        completedOrFailed.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [reelsData, pendingTranscriptions]);

  // Filter reels by date range
  const filteredReels = useMemo(() => {
    if (!reelsData.length || dateFilter === "all") return reelsData;
    const now = new Date();
    let cutoffDays = 30;
    if (dateFilter === "7") cutoffDays = 7;
    else if (dateFilter === "14") cutoffDays = 14;
    else if (dateFilter === "30") cutoffDays = 30;
    else if (dateFilter === "60") cutoffDays = 60;
    else if (dateFilter === "90") cutoffDays = 90;
    else if (dateFilter === "180") cutoffDays = 180;
    const cutoff = new Date(now.getTime() - cutoffDays * 24 * 60 * 60 * 1000);
    return reelsData.filter(r => new Date(r.postedAt) >= cutoff);
  }, [reelsData, dateFilter]);

  const sortedReels = useMemo(() => {
    if (!filteredReels.length) return [];
    const sorted = [...filteredReels];
    switch (sortBy) {
      case "views_desc":
        return sorted.sort((a, b) => b.viewCount - a.viewCount);
      case "likes_desc":
        return sorted.sort((a, b) => b.likeCount - a.likeCount);
      case "comments_desc":
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case "engagement_desc":
        return sorted.sort((a, b) => b.engagementRate - a.engagementRate);
      case "date_desc":
        return sorted.sort(
          (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        );
      case "date_asc":
        return sorted.sort(
          (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
        );
      default:
        return sorted;
    }
  }, [filteredReels, sortBy]);

  const startTranscription = trpc.transcribe.start.useMutation({
    onSuccess: (data, variables) => {
      if (data.status === "completed") {
        toast.success("Transcription already available!");
        setExpandedReelId(variables.reelId);
      } else {
        toast.info("Transcription started", {
          description: "Processing audio... This may take up to a minute.",
        });
      }
      reelsQuery.refetch();
    },
    onError: (error, variables) => {
      setPendingTranscriptions((prev) => {
        const next = new Set(prev);
        next.delete(variables.reelId);
        return next;
      });
      toast.error("Transcription failed", { description: error.message });
    },
  });

  const exportCsv = trpc.export.csv.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export downloaded!", { description: `Saved as ${data.filename}` });
    },
    onError: (error) => {
      toast.error("Export failed", { description: error.message });
    },
  });

  const exportSheets = trpc.export.googleSheets.useMutation({
    onSuccess: (data) => {
      setShowSheetsDialog(false);
      toast.success("Google Sheet created!", {
        description: "Opening in a new tab...",
        action: {
          label: "Open",
          onClick: () => window.open(data.spreadsheetUrl, "_blank"),
        },
      });
      window.open(data.spreadsheetUrl, "_blank");
    },
    onError: (error) => {
      toast.error("Google Sheets export failed", { description: error.message });
    },
  });
  const dismissDemoBanner = trpc.onboarding.dismissDemoBanner.useMutation({
    onSuccess: () => {
      posthog?.capture("demo_banner_dismissed");
      utils.onboarding.getState.invalidate();
      toast.success("Demo banner dismissed");
    },
    onError: (error) => {
      toast.error("Could not dismiss demo banner", { description: error.message });
    },
  });

  // Dashboard overview data (only fetched when no jobId)
  const showOverview = !jobId && !featuredAccountId;
  const jobsListQuery = trpc.scrape.list.useQuery(undefined, { enabled: showOverview });
  const scriptsListQuery = trpc.scripts.list.useQuery(undefined, { enabled: showOverview });
  const savedListQuery = trpc.saved.list.useQuery(undefined, { enabled: showOverview });
  const collectedListQuery = trpc.collected.list.useQuery(undefined, { enabled: showOverview });

  if (!jobId && featuredAccountId) {
    if (featuredResolveError) {
      return (
        <div className="max-w-3xl mx-auto px-2 sm:px-0 py-14">
          <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              {featuredResolveNotFound
                ? "Featured creator unavailable"
                : "Could not load creator reels"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{featuredResolveError}</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button
                onClick={() => {
                  setFeaturedResolveError(null);
                  setFeaturedResolveNotFound(false);
                  setFeaturedResolveKey((v) => v + 1);
                }}
              >
                Retry
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")}>
                Back to Spy Viral Reels
              </Button>
            </div>
          </div>
        </div>
      );
    }
    // Resolving: keep this screen for the whole featured flow until we navigate with jobId
    // or hit an error above (never fall through to the no-jobId overview).
    return (
      <div className="max-w-3xl mx-auto px-2 sm:px-0 py-14">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {ensureDemoJob.isPending ? "Loading creator reels..." : "Resolving creator…"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {ensureDemoJob.isPending
              ? "Preparing a dashboard view for this featured creator."
              : "Starting…"}
          </p>
        </div>
      </div>
    );
  }

  if (!jobId) {
    const jobs = jobsListQuery.data || [];
    const scripts = scriptsListQuery.data || [];
    const savedReels = savedListQuery.data || [];
    const collectedReels = collectedListQuery.data || [];
    const completedJobs = jobs.filter(j => j.status === "completed");
    const totalReelsScraped = completedJobs.reduce((sum, j) => sum + (j.totalReels || 0), 0);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = user?.name?.split(" ")[0] || "there";
    const timeSavedMinutes = totalReelsScraped * 5;
    const timeSavedHours = (timeSavedMinutes / 60).toFixed(1);
    const isLoading = jobsListQuery.isLoading;

    return (
      <div className="max-w-5xl mx-auto px-2 sm:px-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{greeting}, {firstName} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">Here is what SpyReels has done for you so far.</p>
        </div>

        {totalReelsScraped > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">You have saved approximately {timeSavedHours} hours of manual research</p>
              <p className="text-xs text-muted-foreground mt-0.5">Based on {totalReelsScraped} reels researched at 5 mins per reel manually</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Film className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{isLoading ? "..." : totalReelsScraped}</p>
            <p className="text-xs text-muted-foreground">Reels Researched</p>
          </div>
          <div className="bg-card border border-border/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-md bg-emerald-500/10 flex items-center justify-center">
                <PenLine className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{isLoading ? "..." : scripts.length}</p>
            <p className="text-xs text-muted-foreground">Scripts Created</p>
          </div>
          <div className="bg-card border border-border/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-md bg-amber-500/10 flex items-center justify-center">
                <Bookmark className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{isLoading ? "..." : savedReels.length}</p>
            <p className="text-xs text-muted-foreground">Saved Reels</p>
          </div>
          <div className="bg-card border border-border/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-md bg-violet-500/10 flex items-center justify-center">
                <Inbox className="h-4 w-4 text-violet-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{isLoading ? "..." : collectedReels.length}</p>
            <p className="text-xs text-muted-foreground">Collected Reels</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => setLocation("/")}
            className="bg-card border border-border/40 rounded-lg p-4 text-left hover:bg-accent/50 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">Spy Viral Reels</p>
                <p className="text-xs text-muted-foreground mt-0.5">Spy on any public Instagram creator</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>
          <button
            onClick={() => setLocation("/search")}
            className="bg-card border border-border/40 rounded-lg p-4 text-left hover:bg-accent/50 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">Search Reels</p>
                <p className="text-xs text-muted-foreground mt-0.5">Find viral reels by keyword or URL</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>
          <button
            onClick={() => setLocation("/collected")}
            className="bg-card border border-border/40 rounded-lg p-4 text-left hover:bg-accent/50 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">Collected Reels</p>
                <p className="text-xs text-muted-foreground mt-0.5">Reels shared via Telegram bot</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>
        </div>

        {/* Recent Scrape Jobs */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Recent Spy Sessions</h2>
            {jobs.length > 5 && (
              <Button variant="link" size="sm" className="text-xs" onClick={() => setLocation("/history")}>
                View all
              </Button>
            )}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="bg-card border border-border/40 rounded-lg p-8 text-center">
              <div className="max-w-sm mx-auto">
                <p className="text-sm font-semibold text-foreground mb-4">Get started in 3 steps</p>
                <div className="space-y-3 text-left mb-6">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0 text-xs font-bold text-white">1</div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Start a spy session</p>
                      <p className="text-xs text-muted-foreground">Enter any Instagram handle to spy on their viral Reels</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/40 flex items-center justify-center shrink-0 text-xs font-bold text-white">2</div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Pick a viral Reel and transcribe it</p>
                      <p className="text-xs text-muted-foreground">See exactly what they said and why it worked</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-xs font-bold text-white">3</div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Hit Re-Create and get your script</p>
                      <p className="text-xs text-muted-foreground">AI writes a script based on what made it go viral</p>
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={() => setLocation("/")}>
                  <Search className="mr-2 h-3.5 w-3.5" />
                  Start Your First Spy Session
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {jobs.slice(0, 5).map((job) => (
                <button
                  key={job.id}
                  onClick={() => setLocation(`/dashboard?jobId=${job.id}&from=dashboard`)}
                  className="w-full bg-card border border-border/30 rounded-lg p-3 text-left hover:bg-accent/30 transition-colors flex items-center gap-3"
                >
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {job.profilePicUrl ? (
                      <img
                        src={job.profilePicUrl}
                        alt={job.handle}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
                        }}
                      />
                    ) : (
                      <Users className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">@{job.handle}</span>
                      <Badge
                        variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {job.totalReels} reels &middot; Last {job.timeframeDays} days &middot; {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Scripts */}
        {scripts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Recent Scripts</h2>
              <Button variant="link" size="sm" className="text-xs" onClick={() => setLocation("/scripts")}>
                View all
              </Button>
            </div>
            <div className="space-y-1.5">
              {scripts.slice(0, 3).map((script) => (
                <button
                  key={script.id}
                  onClick={() => setLocation(`/scripts/${script.id}`)}
                  className="w-full bg-card border border-border/30 rounded-lg p-3 text-left hover:bg-accent/30 transition-colors flex items-center gap-3"
                >
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <PenLine className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{script.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {script.wordCount} words &middot; {script.status === "approved" ? "Approved" : "Draft"}
                      {script.sourceHandle && <> &middot; from @{script.sourceHandle}</>}
                    </p>
                  </div>
                  <Badge variant={script.status === "approved" ? "default" : "secondary"} className="text-[10px] shrink-0">
                    {script.status}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const isLoading = job?.status === "running" || job?.status === "pending";
  const showDemoBanner = !!job?.isDemo && !user?.hasDismissedDemoBanner;
  const canShowAiBadge =
    !!job?.classifiedNicheSlug &&
    !!job?.classifiedConfidence &&
    (job.classifiedConfidence === "high" ||
      job.classifiedConfidence === "medium" ||
      job.classifiedConfidence === "low");

  return (
    <div className="max-w-[1700px] mx-auto px-2 sm:px-0">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="min-w-0">
          {showDemoBanner && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-500/15 to-amber-500/5 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-amber-400/40 bg-amber-400/20 text-base">
                📺
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-300">This is a demo dashboard preloaded for you.</p>
                <p className="text-xs text-muted-foreground">Ready to spy on a real creator?</p>
              </div>
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => {
                  posthog?.capture("demo_banner_cta_clicked");
                  setLocation("/research");
                }}
              >
                Start a new spy session
              </Button>
              <Tooltip content="Hide this banner">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={() => dismissDemoBanner.mutate()}
                  disabled={dismissDemoBanner.isPending}
                >
                  {dismissDemoBanner.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </Tooltip>
            </div>
          )}
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Tooltip content="Back to Spy Viral Reels">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
                    if (fromPage === "history") {
                      setLocation("/history");
                    } else if (fromPage === "research") {
                      setLocation("/");
                    } else if (fromPage === "dashboard") {
                      setLocation("/dashboard");
                    } else {
                      setLocation("/history");
                    }
                  }}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    {job ? `@${displayScrapeHandle || stripAtHandle(job.handle)}` : "Loading..."}
                  </h1>
                  {canShowAiBadge && (
                    <AiBadge
                      nicheSlug={job.classifiedNicheSlug!}
                      confidence={job.classifiedConfidence as BadgeConfidence}
                    />
                  )}
                  {job && (
                    <Tooltip content="All reels successfully collected. Use Account Monitoring to re-sync.">
                      <Badge
                        variant={
                          job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"
                        }
                        className="text-xs"
                      >
                        {job.status === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {job.status}
                      </Badge>
                    </Tooltip>
                  )}
                </div>
              </div>
              {job && (
                <p className="text-sm text-muted-foreground ml-11">
                  {job.status === "completed" && reelsQuery.isLoading && reelsData.length === 0 ? (
                    "Loading reels…"
                  ) : (
                    <>
                      {sortedReels.length}
                      {dateFilter !== "all" ? ` of ${reelsData.length}` : ""} reels
                      {dateFilter !== "all" ? ` (last ${dateFilter} days)` : " collected"}
                    </>
                  )}
                  {followerCount > 0 && job.status === "completed" && !(reelsQuery.isLoading && reelsData.length === 0) && (
                    <> &middot; {formatNumber(followerCount)} followers</>
                  )}
                  {job.classifiedNicheSlug && (
                    <>
                      {" "}
                      &middot;{" "}
                      <span className="text-primary">{toReadableNiche(job.classifiedNicheSlug)}</span>
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 ml-11 sm:ml-0 flex-wrap">
              {job?.status === "completed" && reelsData.length > 0 && (
                <>
                  <Tooltip content="Filter reels by date posted">
                    <div>
                      <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="w-[130px] sm:w-[150px] h-9 bg-card text-sm">
                          <SelectValue placeholder="Date range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Time</SelectItem>
                          <SelectItem value="7">Last 7 Days</SelectItem>
                          <SelectItem value="14">Last 14 Days</SelectItem>
                          <SelectItem value="30">Last 30 Days</SelectItem>
                          <SelectItem value="60">Last 60 Days</SelectItem>
                          <SelectItem value="90">Last 90 Days</SelectItem>
                          <SelectItem value="180">Last 180 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Tooltip>

                  <Tooltip content="Change how reels are sorted">
                    <div>
                      <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                        <SelectTrigger className="h-9 w-[min(100%,20rem)] min-w-[16rem] max-w-none bg-card text-sm">
                          <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                          {SORT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className="flex items-center gap-2">
                                {opt.icon}
                                {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </Tooltip>

                  <Tooltip content="Switch between detailed list and visual grid view">
                    <div className="inline-flex items-center rounded-md border border-border bg-card p-1">
                      <Button
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setViewModeTracked("list")}
                      >
                        <List className="h-3.5 w-3.5 mr-1" />
                        List
                      </Button>
                      <Button
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setViewModeTracked("grid")}
                      >
                        <Grid3X3 className="h-3.5 w-3.5 mr-1" />
                        Grid
                      </Button>
                    </div>
                  </Tooltip>

                  <Tooltip content="Download all reels data as a CSV file">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        if (!exportGate.allowed) {
                          toast.error(`Export limit reached (${exportGate.used}/${exportGate.limit})`, {
                            description: "Upgrade your plan for more exports.",
                            action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
                          });
                          return;
                        }
                        exportCsv.mutate({ jobId: jobId! });
                      }}
                      disabled={exportCsv.isPending}
                    >
                      {exportCsv.isPending ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5 sm:mr-2" />
                      )}
                      <span className="hidden sm:inline">Export CSV</span>
                    </Button>
                  </Tooltip>

                  <Tooltip content="Live-sync this data to a Google Sheet">
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        if (sheetsAvailable.data?.available) {
                          setShowSheetsDialog(true);
                        } else {
                          toast.info("Google Sheets not configured", {
                            description:
                              "Add your Google service account credentials in Settings to enable Google Sheets export.",
                          });
                        }
                      }}
                    >
                      <Sheet className="h-3.5 w-3.5 sm:mr-2" />
                      <span className="hidden sm:inline">Connect to Sheets</span>
                    </Button>
                  </Tooltip>
                </>
              )}
            </div>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="border border-border/50 bg-card rounded-lg p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-foreground font-medium">Scraping in progress...</p>
                  <p className="text-sm text-muted-foreground mt-1">{job?.totalReels || 0} reels found so far</p>
                </div>
              </div>
            </div>
          )}

          {/* Failed state */}
          {job?.status === "failed" && (
            <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <p className="text-destructive font-medium">Scraping failed</p>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {job.errorMessage || "An unknown error occurred"}
                </p>
                <Button variant="outline" onClick={() => setLocation("/")}>
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Loading skeleton while reels are being fetched */}
          {job?.status === "completed" && reelsQuery.isLoading && (
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border/30 p-2 sm:p-3 bg-card/50 flex items-center gap-2 sm:gap-3 animate-pulse">
                  <span className="hidden sm:block w-5 sm:w-6 h-4 bg-muted rounded" />
                  <div className="w-14 h-18 rounded-md bg-muted shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="flex gap-3">
                      <div className="h-3 bg-muted rounded w-16" />
                      <div className="h-3 bg-muted rounded w-12" />
                      <div className="h-3 bg-muted rounded w-14" />
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <div className="h-8 w-8 bg-muted rounded" />
                    <div className="h-8 w-8 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Usage limit banner */}
          {!transcribeGate.isLoading && !transcribeGate.allowed && (
            <div className="mb-4">
              <UpgradePrompt
                action="transcribeCount"
                used={transcribeGate.used}
                limit={transcribeGate.limit}
                planRequired={transcribeGate.planRequired}
                variant="banner"
              />
            </div>
          )}

          {/* Reels list */}
          {job?.status === "completed" && sortedReels.length > 0 && viewMode === "list" && (
            <div className="space-y-1">
              {sortedReels.map((reel, index) => {
                const isExpanded = expandedReelId === reel.id;
                const hasTranscription = reel.transcription?.status === "completed";
                const isProcessing = reel.transcription?.status === "processing" || pendingTranscriptions.has(reel.id);
                const isFailed = reel.transcription?.status === "failed" && !pendingTranscriptions.has(reel.id);
                const isSaved = !!savedMap[reel.id];

                return (
                  <div key={reel.id} className="rounded-lg border border-border/30 overflow-hidden">
                    {/* Reel Row */}
                    <div
                      className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-card/50 hover:bg-card transition-colors cursor-pointer ${
                        isExpanded ? "bg-card border-b border-border/30" : ""
                      }`}
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedReelId(null);
                        } else {
                          setExpandedReelId(reel.id);
                        }
                      }}
                    >
                      {/* Rank */}
                      <span className="text-sm font-mono text-muted-foreground w-5 sm:w-6 text-right shrink-0 hidden sm:block">
                        {index + 1}
                      </span>

                      {/* Thumbnail */}
                      <div className="relative shrink-0 w-14 h-18 rounded-md overflow-hidden bg-muted">
                        {reel.thumbnailUrl ? (
                          <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        )}
                        {reel.duration && (
                          <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono bg-black/70 text-white px-1 rounded">
                            {Math.floor(reel.duration / 60)}:{(reel.duration % 60).toString().padStart(2, "0")}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm text-foreground line-clamp-1 leading-snug">
                            {reel.caption || <span className="text-muted-foreground italic">No caption</span>}
                          </p>
                          {hasTranscription && (
                            <span className="shrink-0 text-[9px] font-medium bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">Transcribed</span>
                          )}
                          {isProcessing && (
                            <span className="shrink-0 text-[9px] font-medium bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full animate-pulse">Processing</span>
                          )}
                          {isFailed && (
                            <span className="shrink-0 text-[9px] font-medium bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">Failed</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {formatNumber(reel.viewCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {formatNumber(reel.likeCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {formatNumber(reel.commentCount)}
                          </span>
                          {reel.engagementRate > 0 && (
                            <span className="flex items-center gap-1 text-emerald-400 font-medium">
                              <TrendingUp className="h-3 w-3" />
                              {reel.engagementRate.toFixed(2)}%
                            </span>
                          )}
                          {/* Competitor posting day & time in user timezone */}
                          <span className="flex items-center gap-1 text-amber-400/80">
                            <Clock className="h-3 w-3" />
                            {formatPostedTime(reel.postedAt, userTimezone)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 ${isSaved ? "text-primary" : "text-muted-foreground"}`}
                          onClick={() => toggleSave.mutate({ reelId: reel.id, jobId: jobId! })}
                          disabled={toggleSave.isPending}
                          title={isSaved ? "Remove from saved" : "Save reel"}
                        >
                          {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                        </Button>

                        {hasTranscription ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => setExpandedReelId(reel.id)}
                          >
                            <FileText className="h-3 w-3 sm:mr-1" />
                            <span className="hidden sm:inline">Transcript</span>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => {
                              if (!transcribeGate.allowed) {
                                toast.error(`Transcription limit reached (${transcribeGate.used}/${transcribeGate.limit})`, {
                                  description: "Upgrade your plan for more transcriptions.",
                                  action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
                                });
                                return;
                              }
                              setPendingTranscriptions((prev) => new Set(prev).add(reel.id));
                              startTranscription.mutate({ reelId: reel.id });
                            }}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                <span className="hidden sm:inline">Transcribing...</span>
                              </>
                            ) : isFailed ? (
                              <>
                                <FileText className="h-3 w-3 sm:mr-1" />
                                <span className="hidden sm:inline">Retry</span>
                              </>
                            ) : (
                              <>
                                <FileText className="h-3 w-3 sm:mr-1" />
                                <span className="hidden sm:inline">Transcribe</span>
                              </>
                            )}
                          </Button>
                        )}

                        {hasTranscription && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => setExpandedReelId(reel.id)}
                          >
                            <Wand2 className="h-3 w-3 sm:mr-1" />
                            <span className="hidden sm:inline">Re-Create</span>
                          </Button>
                        )}

                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                          <a href={reel.reelUrl} target="_blank" rel="noopener noreferrer" title="Open on Instagram">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground"
                          onClick={() => setExpandedReelId(isExpanded ? null : reel.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded inline workflow panel */}
                    {isExpanded && (
                      <InlineWorkflow
                        reelId={reel.id}
                        handle={displayScrapeHandle || job?.handle || ""}
                        hasTranscription={hasTranscription}
                        isProcessing={isProcessing}
                        onTranscribe={() => {
                          setPendingTranscriptions((prev) => new Set(prev).add(reel.id));
                          startTranscription.mutate({ reelId: reel.id });
                        }}
                        userTimezone={userTimezone}
                        postedAt={reel.postedAt}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Grid view */}
          {job?.status === "completed" && sortedReels.length > 0 && viewMode === "grid" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sortedReels.map((reel, index) => (
                <button
                  key={reel.id}
                  type="button"
                  className="group relative aspect-[9/14] overflow-hidden rounded-lg border border-border/40 bg-card text-left"
                  onClick={() => window.open(reel.reelUrl, "_blank", "noopener,noreferrer")}
                >
                  {reel.thumbnailUrl ? (
                    <img
                      src={reel.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full bg-muted/40 flex items-center justify-center">
                      <Film className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                  )}
                  <div className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
                    #{index + 1}
                  </div>
                  {reel.engagementRate > 0 && (
                    <div className="absolute right-2 top-2 rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
                      {reel.engagementRate.toFixed(2)}%
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent p-3">
                    <p className="text-xs text-white line-clamp-2">{reel.caption || "No caption"}</p>
                    <p className="mt-1 text-[10px] font-mono text-white/80">
                      {formatNumber(reel.viewCount)} views
                      {reel.duration ? ` · ${formatDuration(reel.duration)}` : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty state - only show when reels have loaded but are empty */}
          {job?.status === "completed" && !reelsQuery.isLoading && sortedReels.length === 0 && (
            <div className="border border-border/50 bg-card rounded-lg p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <Film className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-muted-foreground">
                  No reels found for @{(displayScrapeHandle || job.handle)} in the last {job.timeframeDays} days.
                </p>
              </div>
            </div>
          )}
        </div>
        <aside className="min-w-0 w-full space-y-4 border-t border-border/40 pt-6 lg:border-t-0 lg:pt-0 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {!jobComplete ? (
            <>
              <div className="rounded-xl border border-border/40 bg-card p-4">
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                <div className="h-3 w-24 bg-muted/80 rounded mt-2 animate-pulse" />
                <div className="space-y-2 mt-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="h-12 rounded-lg bg-muted/60 animate-pulse" />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card p-4">
                <div className="h-4 w-36 bg-muted rounded animate-pulse" />
                <div className="h-3 w-52 bg-muted/80 rounded mt-2 animate-pulse" />
                <div className="space-y-2 mt-4">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="h-12 rounded-lg bg-muted/60 animate-pulse" />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="h-4 w-44 bg-primary/20 rounded animate-pulse" />
                <div className="h-3 w-full bg-primary/15 rounded mt-3 animate-pulse" />
                <div className="h-9 w-full bg-primary/25 rounded mt-4 animate-pulse" />
              </div>
            </>
          ) : (
            <>
              {/* Related creators — hidden when no niche context (graceful CTA instead) */}
              {!featuredHandleContext.isFetched ? (
                <div className="rounded-xl border border-border/40 bg-card p-4">
                  <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-24 bg-muted/80 rounded mt-2 animate-pulse" />
                  <div className="space-y-2 mt-4">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div key={idx} className="h-12 rounded-lg bg-muted/60 animate-pulse" />
                    ))}
                  </div>
                </div>
              ) : !nicheSlugForSidebar ? (
                <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
                  <p className="text-sm font-medium text-foreground">Start exploring creators</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Browse featured creators by niche to compare what is working in your space.
                  </p>
                  <Button size="sm" className="mt-4 w-full" onClick={() => setLocation("/research")}>
                    Start exploring creators
                  </Button>
                </div>
              ) : relatedCreatorsQuery.isPending ? (
                <div className="rounded-xl border border-border/40 bg-card p-4">
                  <div className="h-5 w-48 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-28 bg-muted/80 rounded mt-2 animate-pulse" />
                  <div className="space-y-2 mt-4">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div key={idx} className="h-12 rounded-lg bg-muted/60 animate-pulse" />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border/40 bg-card p-4">
                  <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">
                    Top creators in this <em className="text-primary not-italic">niche</em>
                  </h3>
                  {sidebarNicheLabel && (
                    <div className="mt-1 inline-block rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {sidebarNicheLabel}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Also spying on <span className="text-foreground">@{(displayScrapeHandle || job.handle)}</span>? Here are more creators in
                    the same niche.
                  </p>
                  {relatedCreatorsQuery.data?.length === 0 ? (
                    <p className="mt-4 text-center text-xs text-muted-foreground">No related creators in this niche yet</p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2">
                      {relatedCreatorsQuery.data?.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (job?.handle && nicheSlugForSidebar) {
                              posthog?.capture("related_creator_clicked", {
                                from_creator_handle: normalizeAnalyticsHandle(job.handle),
                                to_creator_handle: normalizeAnalyticsHandle(c.handle),
                                from_niche: nicheSlugForSidebar,
                              });
                            }
                            setLocation(`/dashboard?featuredAccountId=${c.id}`);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg border border-border/50 bg-background/50 p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/60 to-fuchsia-500/50 text-[10px] font-semibold text-white">
                            {c.profilePicUrl ? (
                              <img src={c.profilePicUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (c.displayName || c.handle).slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">
                              {c.displayName || `@${c.handle}`}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              @{c.handle} · {formatNumber(c.followerCount)} ·{" "}
                              <span className="font-mono text-emerald-400">{c.avgEngagementRate.toFixed(2)}%</span>
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Going viral now — placeholder */}
              <div className="rounded-xl border border-border/40 bg-card p-4">
                <div className="flex items-start gap-2">
                  <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">
                    Going <em className="text-primary not-italic">viral</em> now
                  </h3>
                </div>
                <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-8 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Trending creators coming soon</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    We&apos;ll surface creators blowing up in your niche right here.
                  </p>
                </div>
              </div>

              {/* Upgrade */}
              {!hideUpgradeSidebarPanel && (
                <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/15 via-fuchsia-500/10 to-transparent p-4 text-center">
                  {billingPlan === "pro" ? (
                    <>
                      <h3 className="font-serif text-base font-normal text-foreground">Thanks for being on Pro</h3>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        You have full access to deep creator research and script workflows.
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Need team seats and higher limits?{" "}
                        <button
                          type="button"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => setLocation("/billing")}
                        >
                          Go Business
                        </button>
                      </p>
                      <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setLocation("/billing")}>
                        Manage billing
                      </Button>
                    </>
                  ) : (
                    <>
                      <h3 className="font-serif text-base font-normal text-foreground">Unlock unlimited spying</h3>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        Upgrade for unlimited creator research and more script generations each month.
                      </p>
                      <Button size="sm" className="mt-3 w-full" onClick={() => setLocation("/billing")}>
                        View plans & billing
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* Google Sheets Dialog */}
      <Dialog open={showSheetsDialog} onOpenChange={setShowSheetsDialog}>
        <DialogContent className="bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Export to Google Sheets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">Share with email (optional)</label>
              <Input
                placeholder="your@email.com"
                value={sheetsEmail}
                onChange={(e) => setSheetsEmail(e.target.value)}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                The sheet will be shared with this email address for editing.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => exportSheets.mutate({ jobId: jobId!, email: sheetsEmail || undefined })}
              disabled={exportSheets.isPending}
            >
              {exportSheets.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating sheet...
                </>
              ) : (
                <>
                  <Sheet className="mr-2 h-4 w-4" />
                  Create Google Sheet
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

