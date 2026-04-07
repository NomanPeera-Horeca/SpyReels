import { useState, useMemo, useCallback, useEffect } from "react";
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
  Search,
  Inbox,
  PenLine,
  ArrowRight,
  Users,
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

type SortOption =
  | "views_desc"
  | "likes_desc"
  | "comments_desc"
  | "engagement_desc"
  | "date_desc"
  | "date_asc";

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ReactNode }[] = [
  { value: "views_desc", label: "Highest Views", icon: <Eye className="h-3.5 w-3.5" /> },
  { value: "likes_desc", label: "Highest Likes", icon: <Heart className="h-3.5 w-3.5" /> },
  { value: "comments_desc", label: "Highest Comments", icon: <MessageCircle className="h-3.5 w-3.5" /> },
  { value: "engagement_desc", label: "Highest Engagement Rate", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { value: "date_desc", label: "Date (Newest)", icon: <CalendarIcon className="h-3.5 w-3.5" /> },
  { value: "date_asc", label: "Date (Oldest)", icon: <CalendarIcon className="h-3.5 w-3.5" /> },
];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const jobId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const id = params.get("jobId");
    return id ? parseInt(id, 10) : null;
  }, [searchString]);
  const fromPage = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("from") || null;
  }, [searchString]);
  const [sortBy, setSortBy] = useState<SortOption>("engagement_desc");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [expandedReelId, setExpandedReelId] = useState<number | null>(null);
  const [showSheetsDialog, setShowSheetsDialog] = useState(false);
  const [sheetsEmail, setSheetsEmail] = useState("");

  const sheetsAvailable = trpc.export.sheetsAvailable.useQuery();
  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";
  const utils = trpc.useUtils();

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

  // Dashboard overview data (only fetched when no jobId)
  const jobsListQuery = trpc.scrape.list.useQuery(undefined, { enabled: !jobId });
  const scriptsListQuery = trpc.scripts.list.useQuery(undefined, { enabled: !jobId });
  const savedListQuery = trpc.saved.list.useQuery(undefined, { enabled: !jobId });
  const collectedListQuery = trpc.collected.list.useQuery(undefined, { enabled: !jobId });

  if (!jobId) {
    const jobs = jobsListQuery.data || [];
    const scripts = scriptsListQuery.data || [];
    const savedReels = savedListQuery.data || [];
    const collectedReels = collectedListQuery.data || [];
    const completedJobs = jobs.filter(j => j.status === "completed");
    const totalReelsScraped = completedJobs.reduce((sum, j) => sum + (j.totalReels || 0), 0);
    const isLoading = jobsListQuery.isLoading;

    return (
      <div className="max-w-5xl mx-auto px-2 sm:px-0">
        {/* Welcome header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Your SpyReels overview at a glance</p>
        </div>

        {/* Quick Stats */}
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
                <p className="font-medium text-foreground text-sm">Research Reels</p>
                <p className="text-xs text-muted-foreground mt-0.5">Analyze any Instagram account</p>
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
            <h2 className="text-sm font-semibold text-foreground">Recent Research Jobs</h2>
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
              <Film className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No research jobs yet. Start by analyzing an Instagram account.</p>
              <Button size="sm" onClick={() => setLocation("/")}>
                <Search className="mr-2 h-3.5 w-3.5" />
                Start Your First Research
              </Button>
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

  const job = jobQuery.data;
  const isLoading = job?.status === "running" || job?.status === "pending";

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
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
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {job ? `@${job.handle}` : "Loading..."}
            </h1>
            {job && (
              <Badge
                variant={
                  job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"
                }
                className="text-xs"
              >
                {job.status === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {job.status}
              </Badge>
            )}
          </div>
          {job && (
            <p className="text-sm text-muted-foreground ml-11">
              {sortedReels.length}{dateFilter !== "all" ? ` of ${reelsData.length}` : ""} reels{dateFilter !== "all" ? ` (last ${dateFilter} days)` : " collected"}
              {followerCount > 0 && <> &middot; {formatNumber(followerCount)} followers</>}
            </p>
          )}
        </div>

                <div className="flex items-center gap-2 ml-11 sm:ml-0 flex-wrap">
          {job?.status === "completed" && reelsData.length > 0 && (
            <>
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

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[160px] sm:w-[200px] h-9 bg-card text-sm">
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
      {job?.status === "completed" && sortedReels.length > 0 && (
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
                    handle={job?.handle || ""}
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

      {/* Empty state - only show when reels have loaded but are empty */}
      {job?.status === "completed" && !reelsQuery.isLoading && sortedReels.length === 0 && (
        <div className="border border-border/50 bg-card rounded-lg p-8">
          <div className="flex flex-col items-center justify-center gap-4">
            <Film className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              No reels found for @{job.handle} in the last {job.timeframeDays} days.
            </p>
          </div>
        </div>
      )}

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

