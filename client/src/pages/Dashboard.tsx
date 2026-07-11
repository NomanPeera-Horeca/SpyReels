import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MIN_SPY_DISPLAY_REELS } from "@shared/spyReelsLimits";
import { ScrapeJobProgressUI } from "@/components/ScrapeJobProgressUI";
import { FounderInterviewBanner } from "@/components/FounderInterviewBanner";
import { snapshotFromProgressRow } from "@shared/scrapeProgressUi";
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
import { AppLink } from "@/components/AppLink";
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
  Radar,
  BookOpen,
  CalendarDays,
} from "lucide-react";
import {
  InlineWorkflow,
  formatNumber,
  formatPostedTime,
} from "@/components/InlineWorkflow";
import { GridReelWorkflowDialog } from "@/components/GridReelWorkflowDialog";
import {
  ReelActionButtons,
  type ReelActionSource,
} from "@/components/ReelActionButtons";
import { useUsageGate } from "@/hooks/useUsageGate";
import {
  useLibraryRemakeChain,
  type LibraryRemakeSource,
  type LibraryRemakeStage,
} from "@/hooks/useLibraryRemakeChain";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useFeatureLock } from "@/components/UpgradeSidesheet";
import { BrandCoachBadge } from "@/components/BrandCoachBadge";
import { useBrandCoachBatchPrefetched } from "@/hooks/useBrandCoachBatchPrefetched";
import { useAuth } from "@/_core/hooks/useAuth";
import { normalizeAnalyticsHandle, cn } from "@/lib/utils";
import Tooltip from "@/components/Tooltip";
import { mergeRemakeability } from "@/lib/remakeability";
import {
  downloadExportFile,
  trackExportJob,
  untrackExportJob,
} from "@/lib/exportJobs";
import { ExportScopeDialog } from "@/components/ExportScopeDialog";
import {
  exportScopeNeedsPrompt,
  resolveExportScope,
  type ExportScope,
} from "@shared/exportScope";
import {
  buildLibraryOneClickRemake,
  reelClassificationFromRow,
} from "@/lib/oneClickRemakeAction";
import { ONBOARDING_NICHES_BY_SLUG } from "@/data/onboardingNiches";
import { V13ReelClassificationBadges } from "@/components/V13ReelClassificationBadges";
import { resolveFromParamFallback } from "@shared/appNavigation";
import { useAppBack } from "@/hooks/useAppBack";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";

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

function nicheLabelFromSlug(slug: string): string {
  return ONBOARDING_NICHES_BY_SLUG.get(slug)?.name ?? toReadableNiche(slug);
}

/** Weight niches by how much the user has spied in each (status + recency); falls back to settings slugs. */
function resolveDashboardHeroNicheLabels(
  jobs: Array<{
    isDemo: boolean;
    classifiedNicheSlug: string | null;
    status: string;
    updatedAt: Date | string;
  }>,
  settingsSlugs: string[] | null | undefined
): string[] {
  const scores = new Map<string, number>();
  for (const j of jobs) {
    if (j.isDemo) continue;
    const slug = j.classifiedNicheSlug;
    if (!slug) continue;
    const t = new Date(j.updatedAt).getTime();
    const recency = Number.isFinite(t) ? t / 1e15 : 0;
    let w = 1;
    if (j.status === "completed") w = 4;
    else if (j.status === "running" || j.status === "pending") w = 2.5;
    else if (j.status === "failed") w = 0.5;
    scores.set(slug, (scores.get(slug) ?? 0) + w + recency);
  }
  const orderedSlugs = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  const pickSlugs =
    orderedSlugs.length > 0
      ? orderedSlugs
      : (settingsSlugs ?? []).filter((s): s is string => Boolean(s?.trim()));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of pickSlugs) {
    const key = s.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
    if (unique.length >= 3) break;
  }
  return unique.map(nicheLabelFromSlug);
}

function DashboardHeroNicheLine({
  nicheLabels,
  className,
}: {
  nicheLabels: string[];
  /** Muted baseline; emphasized spans pick up foreground. */
  className?: string;
}) {
  const Em = ({ children }: { children: React.ReactNode }) => (
    <span className="font-medium text-foreground/95">{children}</span>
  );
  let inner: React.ReactNode;
  if (nicheLabels.length === 0) {
    inner = <>what is working in your niche</>;
  } else if (nicheLabels.length === 1) {
    inner = (
      <>
        what is working in <Em>{nicheLabels[0]}</Em>
      </>
    );
  } else if (nicheLabels.length === 2) {
    inner = (
      <>
        what is working in <Em>{nicheLabels[0]}</Em> and <Em>{nicheLabels[1]}</Em>
      </>
    );
  } else {
    inner = (
      <>
        what is working in <Em>{nicheLabels[0]}</Em>, <Em>{nicheLabels[1]}</Em>, and related niches
      </>
    );
  }
  return <span className={className}>{inner}</span>;
}

/** Strip @ for display; avoid placeholder "owner" if scraper left bad job.handle  -  fall back to first reel. */
function stripAtHandle(h: string | undefined | null) {
  return (h ?? "").replace(/^@/, "").trim();
}

/** Completed transcription with no usable speech (empty transcript and segments). */
function transcriptionIsNoSpeech(
  t: { status?: string; transcript?: string | null; segments?: unknown } | null | undefined
): boolean {
  if (!t || t.status !== "completed") return false;
  const segs = t.segments;
  const n = Array.isArray(segs) ? segs.length : 0;
  return !String(t.transcript ?? "").trim() && n === 0;
}

/** Two-letter avatar fallback. Uses displayName first, then handle. No question marks. */
function avatarInitialsFromAccount(
  displayName: string | null | undefined,
  handle: string | null | undefined
): string {
  const d = (displayName || "").trim();
  if (d.length >= 2) return d.slice(0, 2).toUpperCase();
  if (d.length === 1) return (d + d).toUpperCase();
  const h = stripAtHandle(handle || "");
  if (h.length >= 2) return h.slice(0, 2).toUpperCase();
  if (h.length === 1) return (h + h).toUpperCase();
  return "··";
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

type RecreateBatchEntry = { latestScriptId: number; status: string };

function reelRecreateState(
  entry: RecreateBatchEntry | undefined
): "none" | "generating" | "ready" | "failed" {
  if (!entry) return "none";
  if (entry.status === "pending" || entry.status === "processing") return "generating";
  if (entry.status === "completed") return "ready";
  return "failed";
}

/** Bug #20: scroll a reel card/row into view and pulse, matching InlineWorkflow + index.css. */
function runReelRowScrollPulse(node: HTMLElement) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "center",
  });
  node.classList.remove("pulse-highlight");
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void node.offsetWidth;
  node.classList.add("pulse-highlight");
  window.setTimeout(() => {
    node.classList.remove("pulse-highlight");
  }, 2100);
}

function dashboardDateFilterLabel(dateFilter: string): string {
  if (dateFilter === "all") return "All Time";
  return `Last ${dateFilter} days`;
}

/** Bug #23: cache scrape snapshots and featured sidebar reads; avoid refetch on every /dashboard?jobId= navigation. */
const DASHBOARD_SNAPSHOT_STALE_MS = 3_600_000;
const DASHBOARD_SIDEBAR_STALE_MS = 300_000;
const RECREATE_BATCH_STALE_MS = 300_000;
const RECREATE_BATCH_POLL_MS = 5_000;

export default function Dashboard() {
  const posthog = usePostHog();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const csvLock = useFeatureLock("csvExport");
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
  const handleDashboardBack = useAppBack(resolveFromParamFallback(fromPage));
  const urlFeaturedReelId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const raw = params.get("featuredReelId");
    if (raw == null || raw === "") return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, [searchString]);
  const [sortBy, setSortBy] = useState<SortOption>("engagement_desc");
  const [dateFilter, setDateFilter] = useState<string>("all");
  /**
   * Grid is the default view as of Commit 7. The previous mode
   * (list|grid) is remembered per-browser in localStorage so users
   * who prefer List only have to toggle once. Lazy initializer
   * reads localStorage on mount; SSR-safe guard because this file
   * also builds server-side during the tRPC type pass.
   */
  const VIEW_MODE_STORAGE_KEY = "reels-dashboard:viewMode";
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "list" || stored === "grid") return stored;
    } catch {
      // localStorage can throw in private mode / sandboxed iframes  - 
      // fall through to the default.
    }
    return "grid";
  });
  const setViewModeTracked = useCallback(
    (next: ViewMode) => {
      setViewMode((prev) => {
        if (prev === next) return prev;
        posthog?.capture("view_toggled", { mode: next });
        try {
          window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
        } catch {
          // ignore; persistence is best-effort.
        }
        return next;
      });
    },
    [posthog]
  );

  const resetDashboardFilters = useCallback(() => {
    setDateFilter("all");
  }, []);

  const prevJobStatusRef = useRef<string | undefined>(undefined);
  const prevHasCompletedFirstSpyRef = useRef<boolean | undefined>(undefined);
  /** Ensures `first_spy_completed` fires at most once per browser session (milestone, not per job). */
  const firstSpyMilestoneLoggedRef = useRef(false);
  /** Bug #20: avoid double toast if React re-runs the widen branch before `dateFilter` updates. */
  const widenForDeepLinkNotifiedRef = useRef<string | null>(null);
  const reelRowElsRef = useRef(new Map<number, HTMLDivElement>());
  const [expandedReelId, setExpandedReelId] = useState<number | null>(null);
  /** Grid view: full workflow in a dialog instead of inline under the card. */
  const [gridModalReelId, setGridModalReelId] = useState<number | null>(null);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  /**
   * Commit 9  -  (reelId, nonce) pair that tells the corresponding
   * InlineWorkflow instance to scroll to its Re-create section and
   * pulse. We bump `nonce` on every "Make My Version" click so
   * repeated clicks on the already-expanded row still fire the cue  - 
   * this is the fix for "users click Re-Create and nothing appears
   * to happen". Nulling this out isn't required; stale values are
   * ignored once their reelId no longer matches.
   */
  const [recreatePulse, setRecreatePulse] = useState<{
    reelId: number;
    nonce: number;
    openScriptId?: number;
  } | null>(null);
  const triggerRecreatePulse = useCallback((reelId: number) => {
    if (viewMode === "grid") {
      setGridModalReelId(reelId);
    } else {
      setExpandedReelId((prev) => (prev === reelId ? prev : reelId));
    }
    setRecreatePulse((prev) => ({
      reelId,
      nonce: (prev?.reelId === reelId ? prev.nonce : 0) + 1,
    }));
  }, [viewMode]);
  const triggerOpenMyScript = useCallback((reelId: number, openScriptId: number) => {
    if (viewMode === "grid") {
      setGridModalReelId(reelId);
    } else {
      setExpandedReelId((prev) => (prev === reelId ? prev : reelId));
    }
    setRecreatePulse((prev) => ({
      reelId,
      openScriptId,
      nonce: (prev?.reelId === reelId ? prev.nonce : 0) + 1,
    }));
  }, [viewMode]);
  const setReelRowRef = useCallback((id: number) => (el: HTMLDivElement | null) => {
    if (el) reelRowElsRef.current.set(id, el);
    else reelRowElsRef.current.delete(id);
  }, []);
  const [showSheetsDialog, setShowSheetsDialog] = useState(false);
  const [sheetsEmail, setSheetsEmail] = useState("");
  const [showExportScopeDialog, setShowExportScopeDialog] = useState(false);
  const [exportScopeRegenerate, setExportScopeRegenerate] = useState(false);
  const [exportScopePreference, setExportScopePreference] =
    useState<ExportScope>("top_viral_30");

  /** Path B: featured catalog dashboard (no scrape_job). */
  const isFeaturedView = !!featuredAccountId && !jobId;

  const exportLatestQuery = trpc.export.latestForScrapeJob.useQuery(
    { jobId: jobId!, scope: exportScopePreference },
    {
      enabled: !!jobId && !isFeaturedView,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return false;
        return d.status === "pending" || d.status === "processing" ? 2500 : false;
      },
    }
  );

  const [activeExportJobId, setActiveExportJobId] = useState<number | null>(null);

  const exportStatusQuery = trpc.export.status.useQuery(
    { exportJobId: activeExportJobId! },
    {
      enabled: activeExportJobId != null,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return 2500;
        return d.status === "pending" || d.status === "processing" ? 2500 : false;
      },
    }
  );

  const exportDownload = trpc.export.download.useMutation({
    onSuccess: (data) => {
      downloadExportFile(data);
      toast.success("Export downloaded!", { description: `Saved as ${data.filename}` });
    },
    onError: (error) => {
      toast.error("Download failed", { description: error.message });
    },
  });

  const exportStart = trpc.export.start.useMutation({
    onSuccess: (data) => {
      if (data.cached && data.status === "completed") {
        exportDownload.mutate({ exportJobId: data.exportJobId });
        return;
      }
      setActiveExportJobId(data.exportJobId);
      trackExportJob({
        exportJobId: data.exportJobId,
        scrapeJobId: jobId!,
        handle: stripAtHandle(jobQuery.data?.handle ?? "") || "export",
      });
      toast.info("Export started", {
        description: "You can leave this page. We will notify you when it is ready.",
      });
      void exportLatestQuery.refetch();
    },
    onError: (error) => {
      toast.error("Export failed", { description: error.message });
    },
  });

  useEffect(() => {
    const latest = exportLatestQuery.data;
    if (latest && (latest.status === "pending" || latest.status === "processing")) {
      setActiveExportJobId(latest.exportJobId);
    }
  }, [exportLatestQuery.data]);

  useEffect(() => {
    const status = exportStatusQuery.data;
    if (!status || status.status !== "completed" || !activeExportJobId) return;
    void exportLatestQuery.refetch();
    untrackExportJob(activeExportJobId);
    if (document.visibilityState === "visible") {
      exportDownload.mutate({ exportJobId: activeExportJobId });
    }
    setActiveExportJobId(null);
  }, [exportStatusQuery.data, activeExportJobId, exportDownload, exportLatestQuery]);

  const exportInProgress =
    exportStart.isPending ||
    exportLatestQuery.data?.status === "pending" ||
    exportLatestQuery.data?.status === "processing" ||
    exportStatusQuery.data?.status === "pending" ||
    exportStatusQuery.data?.status === "processing";

  const exportProgressLabel = (() => {
    const s = exportStatusQuery.data ?? exportLatestQuery.data;
    if (!s) return "Preparing export…";
    if (s.progressLabel) return `${s.progressLabel} (${s.progressPercent}%)`;
    return `Preparing export… (${s.progressPercent}%)`;
  })();

  const cachedExportReady =
    exportLatestQuery.data?.cached === true &&
    exportLatestQuery.data.status === "completed";

  const exportIsStale = exportLatestQuery.data?.isStale === true;

  const sheetsAvailable = trpc.export.sheetsAvailable.useQuery();
  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";
  const utils = trpc.useUtils();
  const cachedJobForStale =
    jobId != null ? utils.scrape.status.getData({ jobId }) : undefined;
  const jobStaleTime =
    cachedJobForStale == null
      ? 0
      : cachedJobForStale.status === "pending" || cachedJobForStale.status === "running"
        ? 0
        : DASHBOARD_SNAPSHOT_STALE_MS;
  const billingSubscriptionQuery = trpc.billing.subscription.useQuery(undefined, {
    enabled: !!jobId || isFeaturedView,
  });

  const featuredDataQuery = trpc.featured.getDashboardData.useQuery(
    {
      featuredAccountId: featuredAccountId!,
    },
    { enabled: isFeaturedView }
  );

  // Usage gates for feature gating
  const transcribeGate = useUsageGate("transcribeCount");
  const exportGate = useUsageGate("exportCount");

  const jobQuery = trpc.scrape.status.useQuery(
    { jobId: jobId! },
    {
      enabled: !!jobId,
      staleTime: jobStaleTime,
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

  const scrapeJobData = jobQuery.data;
  const featuredData = featuredDataQuery.data;

  /** Unified dashboard "job" view-model. In featured mode we shim the
   * scrape-job fields we need from the featured account so all the
   * existing `job?.*` reads just work. Pending-featured renders a
   * minimal "completed" placeholder so the skeleton paths trigger. */
  const job = useMemo(() => {
    if (isFeaturedView) {
      if (!featuredData) {
        return {
          id: 0,
          handle: "",
          status: "completed" as const,
          isDemo: false,
          classifiedNicheSlug: null as string | null,
          classifiedConfidence: null as BadgeConfidence | null,
          totalReels: 0,
          reelsInWindow: null as number | null,
          timeframeDays: null as number | null,
          followerCount: 0,
          errorMessage: null as string | null,
          profilePicUrl: null as string | null,
          displayName: null as string | null,
          avgEngagement: null as number | null,
          bestPostingTime: null as string | null,
        };
      }
      return {
        id: featuredData.account.id,
        handle: featuredData.account.handle,
        status: "completed" as const,
        isDemo: false,
        classifiedNicheSlug: featuredData.account.classifiedNicheSlug,
        classifiedConfidence: null as BadgeConfidence | null,
        totalReels: featuredData.reels.length,
        reelsInWindow: null as number | null,
        timeframeDays: null as number | null,
        followerCount: featuredData.followerCount,
        errorMessage: null as string | null,
        profilePicUrl: featuredData.account.profilePicUrl,
        displayName: featuredData.account.displayName,
        avgEngagement: featuredData.account.avgEngagement,
        bestPostingTime: featuredData.account.bestPostingTime,
      };
    }
    return scrapeJobData;
  }, [isFeaturedView, featuredData, scrapeJobData]);

  const jobRunning = !isFeaturedView && scrapeJobData?.status === "running";
  const hasPersistedNiche = Boolean(scrapeJobData?.classifiedNicheSlug);

  const featuredHandleContext = trpc.featured.accountContextByHandle.useQuery(
    { handle: scrapeJobData?.handle ?? "" },
    {
      enabled: Boolean(
        jobId &&
          scrapeJobData?.handle &&
          (scrapeJobData.status === "completed" ||
            (scrapeJobData.status === "running" &&
              (scrapeJobData.classifiedNicheSlug || scrapeJobData.isDemo)))
      ),
      staleTime: DASHBOARD_SIDEBAR_STALE_MS,
    }
  );

  const nicheSlugForSidebar = useMemo(() => {
    if (isFeaturedView) {
      return featuredData?.account.classifiedNicheSlug ?? null;
    }
    if (!scrapeJobData) return null;
    const sidebarStatusOk =
      scrapeJobData.status === "completed" ||
      (scrapeJobData.status === "running" && scrapeJobData.classifiedNicheSlug);
    if (!sidebarStatusOk) return null;
    if (scrapeJobData.classifiedNicheSlug) return scrapeJobData.classifiedNicheSlug;
    if (scrapeJobData.isDemo && featuredHandleContext.data?.nicheSlug) {
      return featuredHandleContext.data.nicheSlug;
    }
    return null;
  }, [isFeaturedView, featuredData, scrapeJobData, featuredHandleContext.data]);

  const sidebarNicheLabel = useMemo(() => {
    if (isFeaturedView) {
      const slug = featuredData?.account.classifiedNicheSlug;
      if (featuredData?.account.primaryNicheName) {
        return featuredData.account.primaryNicheName;
      }
      return slug ? toReadableNiche(slug) : "";
    }
    if (!scrapeJobData) return "";
    const sidebarStatusOk =
      scrapeJobData.status === "completed" ||
      (scrapeJobData.status === "running" && scrapeJobData.classifiedNicheSlug);
    if (!sidebarStatusOk) return "";
    if (scrapeJobData.classifiedNicheSlug) {
      return toReadableNiche(scrapeJobData.classifiedNicheSlug);
    }
    if (scrapeJobData.isDemo && featuredHandleContext.data?.nicheName) {
      return featuredHandleContext.data.nicheName;
    }
    return "";
  }, [isFeaturedView, featuredData, scrapeJobData, featuredHandleContext.data]);

  const billingPlan = billingSubscriptionQuery.data?.plan ?? "free";
  const hideUpgradeSidebarPanel = billingPlan === "business" || billingPlan === "agency";
  const jobComplete = isFeaturedView ? !!featuredData : job?.status === "completed";

  const goingViralSlugs = useMemo(
    () =>
      [...new Set((user?.selectedNicheSlugs ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(
        0,
        5
      ),
    [user?.selectedNicheSlugs]
  );

  const reelsQuery = trpc.reels.list.useQuery(
    {
      jobId: jobId!,
    },
    {
      enabled:
        !!jobId &&
        (jobQuery.data?.status === "completed" ||
          jobQuery.data?.status === "running"),
      staleTime: DASHBOARD_SNAPSHOT_STALE_MS,
      refetchInterval: (query) => {
        if (scrapeJobData?.status === "running") return 3000;

        const data = query.state.data;
        if (!data?.reels?.length) return false;
        const list = data.reels as Array<{ transcription?: { status?: string | null } | null; niche?: string | null }>;

        const hasProcessingTranscription = list.some(
          (r) => r.transcription?.status === "processing"
        );
        if (hasProcessingTranscription) return 3000;

        const jobCompleted = scrapeJobData?.status === "completed";
        const hasUnclassified = list.some((r) => r.niche == null);
        if (jobCompleted && hasUnclassified) return 5000;

        return false;
      },
    }
  );

  const [pendingTranscriptions, setPendingTranscriptions] = useState<Set<number>>(new Set());

  const reelsData = isFeaturedView
    ? featuredData?.reels ?? []
    : reelsQuery.data?.reels ?? [];
  const followerCount = isFeaturedView
    ? featuredData?.followerCount ?? 0
    : reelsQuery.data?.followerCount ?? 0;
  /** Generalized "reels are loading" signal that works for both paths  - 
   * used by the skeleton/progress bar UI. */
  const reelsLoading = isFeaturedView
    ? featuredDataQuery.isPending
    : reelsQuery.isLoading;

  const accountExportReelCount = Math.max(job?.totalReels ?? 0, reelsData.length);

  const beginExportJob = useCallback(
    (regenerate: boolean, scope: ExportScope) => {
      if (!jobId) return;
      const effectiveScope = resolveExportScope(accountExportReelCount, scope);
      setExportScopePreference(effectiveScope);
      setShowExportScopeDialog(false);
      exportStart.mutate({ jobId, regenerate, scope: effectiveScope });
    },
    [jobId, accountExportReelCount, exportStart]
  );

  const requestExport = useCallback(
    (regenerate: boolean) => {
      if (!jobId) return;
      if (!exportGate.allowed) {
        toast.error(`Export limit reached (${exportGate.used}/${exportGate.limit})`, {
          description: "Upgrade your plan for more exports.",
          action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
        });
        return;
      }
      if (exportScopeNeedsPrompt(accountExportReelCount)) {
        setExportScopeRegenerate(regenerate);
        setShowExportScopeDialog(true);
        return;
      }
      beginExportJob(regenerate, "all");
    },
    [
      jobId,
      exportGate.allowed,
      exportGate.used,
      exportGate.limit,
      accountExportReelCount,
      beginExportJob,
      setLocation,
    ]
  );

  /** Real IG handle for display; if job.handle is a bad placeholder, use first reel's owner. */
  const displayScrapeHandle = useMemo(() => {
    const fromJob = stripAtHandle(job?.handle);
    if (fromJob && fromJob.toLowerCase() !== "owner") return fromJob;
    const first = reelsData[0] as { ownerUsername?: string } | undefined;
    const fromReel = stripAtHandle(first?.ownerUsername);
    if (fromReel) return fromReel;
    return fromJob;
  }, [job?.handle, reelsData]);

  const isFeaturedHeaderPending = isFeaturedView && !featuredData;
  const isUserJobH1Pending =
    !isFeaturedView &&
    !!jobId &&
    !displayScrapeHandle &&
    (jobQuery.isPending || !scrapeJobData || (reelsLoading && reelsData.length === 0));

  const onboardingPickHandles = useMemo(() => {
    const raw = user?.selectedCreatorHandles;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [] as string[];
    const current = stripAtHandle(displayScrapeHandle || job?.handle || "").toLowerCase();
    return [
      ...new Set(
        raw
          .map((h) => stripAtHandle(h).toLowerCase())
          .filter((h) => h.length > 0 && h !== current)
      ),
    ].slice(0, 5);
  }, [user?.selectedCreatorHandles, displayScrapeHandle, job?.handle]);

  const sidebarContentReady =
    jobComplete ||
    (jobRunning &&
      (hasPersistedNiche ||
        onboardingPickHandles.length > 0 ||
        goingViralSlugs.length > 0 ||
        (scrapeJobData?.totalReels ?? 0) > 0));

  const sidebarSyncRefreshing = jobRunning && sidebarContentReady;

  const creatorsByHandlesQuery = trpc.featured.creatorsByHandles.useQuery(
    {
      handles: onboardingPickHandles,
      excludeHandle: displayScrapeHandle || job?.handle,
      limit: 5,
    },
    {
      enabled: sidebarContentReady && onboardingPickHandles.length > 0,
      staleTime: DASHBOARD_SIDEBAR_STALE_MS,
    }
  );

  const tier1Decided = onboardingPickHandles.length === 0 || creatorsByHandlesQuery.isFetched;
  const showRelatedFromPicks =
    onboardingPickHandles.length > 0 && (creatorsByHandlesQuery.data?.length ?? 0) > 0;

  /** In featured view we already have the account id from the URL, so
   * Tier 2 can skip the `featuredHandleContext` round-trip. */
  const canQueryRelatedTier2 =
    sidebarContentReady &&
    tier1Decided &&
    !showRelatedFromPicks &&
    Boolean(nicheSlugForSidebar) &&
    (isFeaturedView || featuredHandleContext.isFetched);

  const relatedCreatorsQuery = trpc.featured.relatedCreators.useQuery(
    {
      nicheSlug: nicheSlugForSidebar!,
      excludeAccountId: isFeaturedView
        ? featuredData?.account.id ?? undefined
        : featuredHandleContext.data?.featuredAccountId ?? undefined,
      limit: 5,
    },
    { enabled: canQueryRelatedTier2, staleTime: DASHBOARD_SIDEBAR_STALE_MS }
  );

  const goingViralQuery = trpc.featured.goingViralByNiches.useQuery(
    { slugs: goingViralSlugs },
    {
      enabled: sidebarContentReady && goingViralSlugs.length > 0,
      staleTime: DASHBOARD_SIDEBAR_STALE_MS,
    }
  );

  const relatedPanelLoading =
    (onboardingPickHandles.length > 0 && !creatorsByHandlesQuery.isFetched) ||
    (tier1Decided &&
      !showRelatedFromPicks &&
      Boolean(nicheSlugForSidebar) &&
      !isFeaturedView &&
      !featuredHandleContext.isFetched) ||
    (canQueryRelatedTier2 && relatedCreatorsQuery.isPending);

  const showRelatedPanel =
    showRelatedFromPicks ||
    relatedPanelLoading ||
    (canQueryRelatedTier2 && (relatedCreatorsQuery.data?.length ?? 0) > 0);

  const showGoingViralPanel =
    goingViralSlugs.length > 0 &&
    (goingViralQuery.isPending || (goingViralQuery.data?.length ?? 0) > 0);

  const reelIds = useMemo(() => reelsData.map((r: any) => r.id), [reelsData]);
  /**
   * `saved.checkBatch` accepts a strict XOR of `reelIds` vs `featuredReelIds`
   * (see Commit 3b). We branch the input based on the current view so the
   * returned map is keyed consistently with whatever id we'll feed into
   * `saved.toggle` from the bookmark button.
   */
  const savedBatchQuery = trpc.saved.checkBatch.useQuery(
    isFeaturedView ? { featuredReelIds: reelIds } : { reelIds },
    { enabled: reelIds.length > 0, staleTime: DASHBOARD_SNAPSHOT_STALE_MS }
  );
  const savedMap = savedBatchQuery.data || {};

  /**
   * Latest recreated script id + status per reel (user). Drives the
   * strip: Make My Version / Generating / Open My Script. Same XOR
   * contract as saved.checkBatch.
   */
  const recreateBatchQuery = trpc.recreate.checkBatch.useQuery(
    isFeaturedView ? { featuredReelIds: reelIds } : { reelIds },
    {
      enabled: reelIds.length > 0,
      staleTime: RECREATE_BATCH_STALE_MS,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return false;
        for (const v of Object.values(d)) {
          if (
            v &&
            (v.status === "pending" || v.status === "processing")
          ) {
            return RECREATE_BATCH_POLL_MS;
          }
        }
        return false;
      },
    }
  );
  const recreateMap = recreateBatchQuery.data || {};

  const brandCoachBatch = useBrandCoachBatchPrefetched(
    isFeaturedView ? { featuredReelIds: reelIds } : { reelIds }
  );

  const libraryRemakeOnStageChange = useCallback(
    (
      source: LibraryRemakeSource,
      stage: LibraryRemakeStage,
      prevStage: LibraryRemakeStage | undefined
    ) => {
      if (
        prevStage !== "transcribing" ||
        (stage !== "generating" && stage !== "inspiration")
      ) {
        return;
      }
      if (source.source === "user") {
        void utils.reels.list.invalidate();
        return;
      }
      if (source.source === "featured" && featuredAccountId != null) {
        void utils.featured.getDashboardData.invalidate({ featuredAccountId });
      }
    },
    [utils, featuredAccountId]
  );

  const { libraryRemakeKey, getRemakeState, startRemake, retryRemake, startInspirationSave } =
    useLibraryRemakeChain({ onStageChange: libraryRemakeOnStageChange });

  const invalidateTranscriptionFollowUp = useCallback(
    (variables: { reelId?: number; featuredReelId?: number } | undefined) => {
      void reelsQuery.refetch();
      if (isFeaturedView && featuredAccountId != null) {
        void utils.featured.getDashboardData.invalidate({ featuredAccountId });
      }
      if (variables?.featuredReelId != null) {
        void utils.transcribe.status.invalidate({ featuredReelId: variables.featuredReelId });
      } else if (variables?.reelId != null) {
        void utils.transcribe.status.invalidate({ reelId: variables.reelId });
      }
    },
    [utils, reelsQuery, isFeaturedView, featuredAccountId]
  );

  const toggleSave = trpc.saved.toggle.useMutation({
    onSuccess: (data) => {
      utils.saved.checkBatch.invalidate();
      utils.saved.list.invalidate();
      toast.success(data.saved ? "Saved" : "Removed from saved");
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
      for (const id of completedOrFailed) {
        if (isFeaturedView) {
          void utils.transcribe.status.invalidate({ featuredReelId: id });
        } else {
          void utils.transcribe.status.invalidate({ reelId: id });
        }
      }
      void reelsQuery.refetch();
      if (isFeaturedView && featuredAccountId != null) {
        void utils.featured.getDashboardData.invalidate({ featuredAccountId });
      }
      setPendingTranscriptions((prev) => {
        const next = new Set(prev);
        completedOrFailed.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [
    reelsData,
    pendingTranscriptions,
    utils,
    isFeaturedView,
    featuredAccountId,
    reelsQuery,
  ]);

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

  const gridModalReel = useMemo(
    () =>
      gridModalReelId == null
        ? null
        : (sortedReels.find((r) => r.id === gridModalReelId) ?? null),
    [sortedReels, gridModalReelId]
  );

  useEffect(() => {
    if (gridModalReelId == null) return;
    if (!sortedReels.some((r) => r.id === gridModalReelId)) {
      setGridModalReelId(null);
    }
  }, [gridModalReelId, sortedReels]);

  useEffect(() => {
    if (!isFeaturedView) {
      const params = new URLSearchParams(searchString);
      if (params.has("featuredReelId")) {
        params.delete("featuredReelId");
        const q = params.toString();
        setLocation(q ? `/dashboard?${q}` : "/dashboard", { replace: true });
      }
      return;
    }
    if (urlFeaturedReelId == null) {
      const params = new URLSearchParams(searchString);
      if (params.has("featuredReelId")) {
        params.delete("featuredReelId");
        const q = params.toString();
        setLocation(q ? `/dashboard?${q}` : "/dashboard", { replace: true });
      }
      widenForDeepLinkNotifiedRef.current = null;
      return;
    }
    if (!featuredDataQuery.isSuccess) return;

    const targetId = urlFeaturedReelId;
    if (!reelsData.some((r) => r.id === targetId)) {
      const params = new URLSearchParams(searchString);
      params.delete("featuredReelId");
      const q = params.toString();
      setLocation(q ? `/dashboard?${q}` : "/dashboard", { replace: true });
      return;
    }

    const inSorted = sortedReels.some((r) => r.id === targetId);
    if (!inSorted) {
      if (dateFilter !== "all") {
        if (widenForDeepLinkNotifiedRef.current !== searchString) {
          widenForDeepLinkNotifiedRef.current = searchString;
          setDateFilter("all");
          toast.info("Filter widened to show this reel");
        }
        return;
      }
      const params = new URLSearchParams(searchString);
      params.delete("featuredReelId");
      const q = params.toString();
      setLocation(q ? `/dashboard?${q}` : "/dashboard", { replace: true });
      return;
    }

    if (viewMode === "grid") {
      setGridModalReelId(targetId);
    } else {
      setExpandedReelId(targetId);
    }
    const timer = window.setTimeout(() => {
      const el = reelRowElsRef.current.get(targetId);
      if (el) {
        runReelRowScrollPulse(el);
      }
      const params = new URLSearchParams(searchString);
      params.delete("featuredReelId");
      const q = params.toString();
      setLocation(q ? `/dashboard?${q}` : "/dashboard", { replace: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [
    isFeaturedView,
    urlFeaturedReelId,
    featuredDataQuery.isSuccess,
    reelsData,
    sortedReels,
    dateFilter,
    searchString,
    setLocation,
    viewMode,
  ]);

  useEffect(() => {
    setGridModalReelId(null);
  }, [viewMode]);

  const transcribeInFlightRef = useRef(0);
  const [, setTranscribeInFlightBumper] = useState(0);
  const releaseTranscribeSlot = useCallback(() => {
    transcribeInFlightRef.current = Math.max(0, transcribeInFlightRef.current - 1);
    setTranscribeInFlightBumper((n) => n + 1);
  }, []);

  const startTranscription = trpc.transcribe.start.useMutation({
    onSettled: (_data, _err, variables) => {
      releaseTranscribeSlot();
      invalidateTranscriptionFollowUp(variables);
    },
    onSuccess: (data, variables) => {
      const targetId = variables.reelId ?? variables.featuredReelId;
      if (data.status === "completed") {
        if (targetId != null) {
          setPendingTranscriptions((prev) => {
            const next = new Set(prev);
            next.delete(targetId);
            return next;
          });
        }
        toast.success("Transcription ready");
        if (targetId != null && viewModeRef.current !== "grid") {
          setExpandedReelId(targetId);
        }
      } else {
        // processing: do not clear optimistic pending; onSuccess was wiping
        // the set before refetch, so the UI stayed "Transcribe" until
        // reels.list reflected processing (could be many seconds).
        if (
          data.status === "processing" &&
          "queuePending" in data &&
          (data as { queuePending?: boolean }).queuePending
        ) {
          toast.info("Added to queue", {
            description: "Will start when a slot is free.",
          });
        } else {
          toast.info("Transcription started", {
            description: "Processing audio... This may take up to a minute.",
          });
        }
      }
    },
    onError: (error, variables) => {
      const targetId = variables.reelId ?? variables.featuredReelId;
      if (targetId != null) {
        setPendingTranscriptions((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
      toast.error("Transcription failed", { description: error.message });
    },
  });

  const gridRecreateGenerate = trpc.recreate.generate.useMutation({
    onSuccess: () => {
      utils.recreate.checkBatch.invalidate();
    },
    onError: (error) => {
      toast.error("Script generation failed", { description: error.message });
    },
  });

  const runGridMakeVersion = useCallback(
    (reelId: number, mode: "featured" | "user") => {
      gridRecreateGenerate.mutate(
        mode === "featured"
          ? { featuredReelId: reelId, topic: "", gradeLevel: "auto" }
          : { reelId, topic: "", gradeLevel: "auto" }
      );
    },
    [gridRecreateGenerate]
  );

  const runTranscribeClick = useCallback(
    (reelId: number, opts: { mode: "featured" | "user"; expand: boolean }) => {
      if (!transcribeGate.allowed) {
        toast.error(`Transcription limit reached (${transcribeGate.used}/${transcribeGate.limit})`, {
          description: "Upgrade your plan for more transcriptions.",
          action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
        });
        return;
      }
      if (transcribeInFlightRef.current >= 5) {
        toast.info("Please wait for some transcriptions to complete before starting more.");
        return;
      }
      transcribeInFlightRef.current += 1;
      setTranscribeInFlightBumper((n) => n + 1);
      if (opts.expand) {
        if (viewMode === "grid") {
          setGridModalReelId(reelId);
        } else {
          setExpandedReelId(reelId);
        }
      }
      setPendingTranscriptions((prev) => new Set(prev).add(reelId));
      if (opts.mode === "featured") {
        startTranscription.mutate({ featuredReelId: reelId });
      } else {
        startTranscription.mutate({ reelId });
      }
    },
    [
      transcribeGate.allowed,
      transcribeGate.used,
      transcribeGate.limit,
      setLocation,
      viewMode,
      startTranscription,
    ]
  );

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
  /* Demo banner removed from UI; re-enable by uncommenting this block.
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
  */

  // Dashboard overview data (only fetched when no jobId)
  const showOverview = !jobId && !featuredAccountId;
  const jobsListQuery = trpc.scrape.list.useQuery(undefined, { enabled: showOverview });
  const scriptsListQuery = trpc.scripts.list.useQuery({}, { enabled: showOverview });
  const savedListQuery = trpc.saved.list.useQuery(undefined, {
    enabled: showOverview,
    staleTime: 45_000,
    gcTime: 5 * 60_000,
  });
  const collectedListQuery = trpc.collected.list.useQuery(undefined, { enabled: showOverview });
  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, { enabled: showOverview });

  const dashboardHeroNicheLabels = useMemo(() => {
    if (!showOverview) return [];
    const rows = jobsListQuery.data ?? [];
    const settingsSlugs = onboardingStateQuery.data?.selectedNicheSlugs ?? undefined;
    return resolveDashboardHeroNicheLabels(rows, settingsSlugs);
  }, [showOverview, jobsListQuery.data, onboardingStateQuery.data?.selectedNicheSlugs]);
  /** Featured view NOT_FOUND / network error  -  short-circuit with a
   * dedicated page. Loading is handled by the main dashboard layout
   * below (skeletons render because the pseudo-job is `completed`). */
  if (isFeaturedView && featuredDataQuery.error) {
    const errorCode = (featuredDataQuery.error as any)?.data?.code;
    const isNotFound = errorCode === "NOT_FOUND";
    const message = isNotFound
      ? featuredDataQuery.error.message || "This creator isn't available"
      : featuredDataQuery.error.message ||
        "Could not load creator reels right now.";
    return (
      <div className="max-w-3xl mx-auto px-2 sm:px-0 py-14">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {isNotFound ? "Featured creator unavailable" : "Could not load creator reels"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={() => featuredDataQuery.refetch()}>Retry</Button>
            <Button variant="outline" onClick={handleDashboardBack}>
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!jobId && !featuredAccountId) {
    const allJobs = jobsListQuery.data || [];
    const scripts = scriptsListQuery.data || [];
    const savedReels = savedListQuery.data || [];
    const collectedReels = collectedListQuery.data || [];
    /**
     * Blocker 1 fix: overview stats and Recent Spy Sessions must reflect
     * ONLY user-initiated research. `seedDemoScrape()` writes a
     * `scrape_jobs` row with `isDemo: true` during onboarding, which
     * previously inflated "Reels Researched" / "hours saved" and
     * populated Recent Spy Sessions with a fake session. Filter here
     * so new users see honest zeros and a proper empty state.
     */
    const jobs = allJobs.filter(j => !j.isDemo);
    const isLoading = jobsListQuery.isLoading;
    /** Most recently touched session: prefer in-progress scrape, then last completed or failed work. */
    let lastInteractiveJob: (typeof jobs)[number] | null = null;
    if (jobs.length > 0 && !isLoading) {
      const byUpdated = [...jobs].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      lastInteractiveJob =
        byUpdated.find((j) => j.status === "running") ??
        byUpdated.find((j) => j.status === "completed") ??
        byUpdated.find((j) => j.status === "failed") ??
        null;
    }
    const completedJobs = jobs.filter(j => j.status === "completed");
    const totalReelsScraped = completedJobs.reduce((sum, j) => sum + (j.totalReels || 0), 0);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = user?.name?.split(" ")[0] || "there";
    const timeSavedMinutes = totalReelsScraped * 5;
    const timeSavedHours = (timeSavedMinutes / 60).toFixed(1);
    return (
      <div className="max-w-5xl mx-auto space-y-8 px-2 sm:px-0 pb-10">
        <FounderInterviewBanner scriptsCount={scripts.length} />
        {/* Hero: orientation + primary actions (reduces "what now?" churn) */}
        <section className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-violet-950/40 via-card to-cyan-950/20 p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" aria-hidden />
                Your workspace
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {greeting}, {firstName} 👋
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Start a spy session to see{" "}
                <DashboardHeroNicheLine nicheLabels={dashboardHeroNicheLabels} />, or open Creator Radar to revisit
                creators you already track.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center shrink-0">
              <Button
                asChild
                size="lg"
                className="gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-900/20 hover:opacity-95"
              >
                <AppLink
                  href="/research"
                  onClick={() => {
                    posthog?.capture("dashboard_hero_cta", { action: "spy_creator" });
                  }}
                >
                  <Search className="h-4 w-4" aria-hidden />
                  Spy a creator
                </AppLink>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="gap-2 border-border/60 bg-background/50 backdrop-blur-sm"
              >
                <AppLink
                  href="/history"
                  onClick={() => {
                    posthog?.capture("dashboard_hero_cta", { action: "creator_radar" });
                  }}
                >
                  <Radar className="h-4 w-4" aria-hidden />
                  Creator Radar
                </AppLink>
              </Button>
            </div>
          </div>

          <div className="relative mt-6 border-t border-white/10 pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                {isLoading ? (
                  <div className="h-14 max-w-md animate-pulse rounded-xl bg-black/15" />
                ) : lastInteractiveJob ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {lastInteractiveJob.status === "running"
                          ? "Scrape in progress"
                          : lastInteractiveJob.status === "failed"
                            ? "Last session needs attention"
                            : "Resume your last session"}
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        @{lastInteractiveJob.handle}
                        {lastInteractiveJob.status === "completed" ? (
                          <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                            · {lastInteractiveJob.totalReels ?? 0} reels
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="shrink-0 gap-2 border border-border/60 bg-background/80 shadow-sm backdrop-blur-sm"
                      onClick={() => {
                        posthog?.capture("dashboard_resume_session", {
                          jobId: lastInteractiveJob.id,
                          status: lastInteractiveJob.status,
                        });
                        if (lastInteractiveJob.status === "running") {
                          setLocation(`/scraping?jobId=${lastInteractiveJob.id}`);
                        } else {
                          setLocation(`/dashboard?jobId=${lastInteractiveJob.id}&from=dashboard`);
                        }
                      }}
                    >
                      {lastInteractiveJob.status === "running" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          Continue scraping
                        </>
                      ) : lastInteractiveJob.status === "failed" ? (
                        <>View & retry</>
                      ) : (
                        <>Open reels</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                    Transcripts and scripts you create show up in{" "}
                    <AppLink
                      href="/library"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        posthog?.capture("dashboard_empty_state_library_link");
                      }}
                    >
                      Library
                    </AppLink>
                    . Start with Spy a creator when you are ready.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/5 pt-4 sm:justify-start lg:border-0 lg:pt-0 lg:justify-end">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-border/50 bg-background/40"
                >
                  <AppLink
                    href="/library"
                    onClick={() => {
                      posthog?.capture("dashboard_hero_shortcut", { to: "library" });
                    }}
                  >
                    <BookOpen className="h-3.5 w-3.5" aria-hidden />
                    Library
                  </AppLink>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-border/50 bg-background/40"
                >
                  <AppLink
                    href="/plan"
                    onClick={() => {
                      posthog?.capture("dashboard_hero_shortcut", { to: "plan" });
                    }}
                  >
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    30-Day Plan
                  </AppLink>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {totalReelsScraped > 0 && (
          <div className="flex items-start gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
              <Clock className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-foreground">
                You have saved about{" "}
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{timeSavedHours}</span> hours of
                manual research
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Based on{" "}
                <span className="font-medium text-foreground tabular-nums">{formatNumber(totalReelsScraped)}</span> reels
                researched (about 5 minutes per reel if you did it by hand).
              </p>
            </div>
          </div>
        )}

        <section aria-labelledby="dash-stats-heading">
          <h2 id="dash-stats-heading" className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            At a glance
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AppLink
              href="/history"
              className={cn(
                "block rounded-xl border border-border/40 bg-card p-4 text-left no-underline text-inherit transition-colors",
                "hover:border-primary/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              )}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12">
                <Film className="h-4 w-4 text-primary" aria-hidden />
              </div>
              {isLoading ? (
                <div className="mb-2 h-8 w-16 animate-pulse rounded-md bg-muted" />
              ) : (
                <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{formatNumber(totalReelsScraped)}</p>
              )}
              <p className="text-xs text-muted-foreground">Reels researched</p>
            </AppLink>
            <AppLink
              href="/scripts"
              className={cn(
                "block rounded-xl border border-border/40 bg-card p-4 text-left no-underline text-inherit transition-colors",
                "hover:border-emerald-500/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              )}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/12">
                <PenLine className="h-4 w-4 text-emerald-500" aria-hidden />
              </div>
              {jobsListQuery.isLoading || scriptsListQuery.isLoading ? (
                <div className="mb-2 h-8 w-12 animate-pulse rounded-md bg-muted" />
              ) : (
                <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{scripts.length}</p>
              )}
              <p className="text-xs text-muted-foreground">Scripts created</p>
            </AppLink>
            <AppLink
              href="/saved"
              className={cn(
                "block rounded-xl border border-border/40 bg-card p-4 text-left no-underline text-inherit transition-colors",
                "hover:border-amber-500/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
              )}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/12">
                <Bookmark className="h-4 w-4 text-amber-500" aria-hidden />
              </div>
              {jobsListQuery.isLoading || savedListQuery.isLoading ? (
                <div className="mb-2 h-8 w-10 animate-pulse rounded-md bg-muted" />
              ) : (
                <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{savedReels.length}</p>
              )}
              <p className="text-xs text-muted-foreground">Saved reels</p>
            </AppLink>
            <AppLink
              href="/collected"
              className={cn(
                "block rounded-xl border border-border/40 bg-card p-4 text-left no-underline text-inherit transition-colors",
                "hover:border-violet-500/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30"
              )}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/12">
                <Inbox className="h-4 w-4 text-violet-500" aria-hidden />
              </div>
              {jobsListQuery.isLoading || collectedListQuery.isLoading ? (
                <div className="mb-2 h-8 w-8 animate-pulse rounded-md bg-muted" />
              ) : (
                <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{collectedReels.length}</p>
              )}
              <p className="text-xs text-muted-foreground">Collected reels</p>
            </AppLink>
          </div>
        </section>

        <section aria-labelledby="dash-shortcuts-heading">
          <h2 id="dash-shortcuts-heading" className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Shortcuts
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AppLink
              href="/research"
              onClick={() => {
                posthog?.capture("dashboard_shortcut_tile", { to: "research" });
              }}
              className="group block rounded-2xl border border-border/50 bg-card p-5 text-left no-underline text-inherit transition-all hover:border-primary/30 hover:bg-accent/25 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/15">
                  <Search className="h-5 w-5 text-violet-400" aria-hidden />
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <p className="mt-3 font-semibold text-foreground">Spy Viral Reels</p>
              <p className="mt-1 text-sm text-muted-foreground">Paste a handle and pull ranked reels for any public account.</p>
            </AppLink>
            <AppLink
              href="/collected"
              onClick={() => {
                posthog?.capture("dashboard_shortcut_tile", { to: "collected" });
              }}
              className="group block rounded-2xl border border-border/50 bg-card p-5 text-left no-underline text-inherit transition-all hover:border-violet-500/30 hover:bg-accent/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
                  <Inbox className="h-5 w-5 text-violet-400" aria-hidden />
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <p className="mt-3 font-semibold text-foreground">Collected Reels</p>
              <p className="mt-1 text-sm text-muted-foreground">From Telegram, ready to transcribe and turn into scripts.</p>
            </AppLink>
            <AppLink
              href="/library"
              onClick={() => {
                posthog?.capture("dashboard_shortcut_tile", { to: "library" });
              }}
              className="group block rounded-2xl border border-border/50 bg-card p-5 text-left no-underline text-inherit transition-all hover:border-cyan-500/30 hover:bg-accent/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/12">
                  <BookOpen className="h-5 w-5 text-cyan-500" aria-hidden />
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <p className="mt-3 font-semibold text-foreground">Library</p>
              <p className="mt-1 text-sm text-muted-foreground">All transcripts and scripts in one scrollable place.</p>
            </AppLink>
            <AppLink
              href="/studio"
              onClick={() => {
                posthog?.capture("dashboard_shortcut_tile", { to: "studio" });
              }}
              className="group block rounded-2xl border border-border/50 bg-card p-5 text-left no-underline text-inherit transition-all hover:border-amber-500/30 hover:bg-accent/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12">
                  <Sparkles className="h-5 w-5 text-amber-500" aria-hidden />
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <p className="mt-3 font-semibold text-foreground">AI Coach</p>
              <p className="mt-1 text-sm text-muted-foreground">Write viral scripts with niche-aware prompts and delivery notes.</p>
            </AppLink>
          </div>
        </section>

        {/* Recent spy sessions */}
        <section className="rounded-2xl border border-border/40 bg-card/40 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Recent spy sessions</h2>
              <p className="text-xs text-muted-foreground">Click a row to open that session</p>
            </div>
            {jobs.length > 5 ? (
              <Button asChild variant="ghost" size="sm" className="text-xs text-primary">
                <AppLink href="/history">View all in Creator Radar</AppLink>
              </Button>
            ) : jobs.length > 0 ? (
              <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
                <AppLink href="/history">Open Creator Radar</AppLink>
              </Button>
            ) : null}
          </div>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-10 text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12">
                <Film className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-foreground">Get started in three steps</p>
              <ol className="mx-auto mt-4 max-w-sm space-y-3 text-left text-sm">
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    1
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Spy a creator</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Ranked reels so you see what performed, not a random grid.
                    </span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/65 text-xs font-bold text-primary-foreground">
                    2
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Transcribe a winner</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">See the hook and pacing in plain text.</span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/35 text-xs font-bold text-primary-foreground">
                    3
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Make your version</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Turn the structure into your script and niche.</span>
                  </span>
                </li>
              </ol>
              <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <Button onClick={() => setLocation("/research")}>
                  <Search className="mr-2 h-3.5 w-3.5" aria-hidden />
                  Start first spy session
                </Button>
                <Button variant="outline" onClick={() => setLocation("/research")}>
                  Browse featured creators
                  <ArrowRight className="ml-2 h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {jobs.slice(0, 5).map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setLocation(`/dashboard?jobId=${job.id}&from=dashboard`)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border/30 bg-background/60 p-3 text-left transition-colors",
                    "hover:border-primary/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border/40">
                    {job.profilePicUrl ? (
                      <img
                        src={job.profilePicUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          const parent = el.parentElement;
                          if (parent && !parent.querySelector("svg")) {
                            parent.innerHTML =
                              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-muted-foreground mx-auto"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
                          }
                        }}
                      />
                    ) : (
                      <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-foreground">@{job.handle}</span>
                      <Badge
                        variant={
                          job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"
                        }
                        className="text-[10px] px-1.5 py-0"
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {job.totalReels} reels · {job.timeframeDays}-day window ·{" "}
                      <span className="tabular-nums">{new Date(job.createdAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Recent Scripts */}
        {scripts.length > 0 && (
          <section aria-labelledby="dash-scripts-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="dash-scripts-heading" className="text-sm font-semibold text-foreground">
                Recent scripts
              </h2>
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                <AppLink href="/scripts">View all</AppLink>
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {scripts.slice(0, 3).map((script) => (
                <AppLink
                  key={script.id}
                  href={`/scripts/${script.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border/30 bg-card p-3 text-left no-underline text-inherit transition-colors",
                    "hover:border-primary/25 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <PenLine className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{script.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {script.wordCount} words · {script.status === "approved" ? "Approved" : "Draft"}
                      {script.sourceHandle ? <> · @{script.sourceHandle}</> : null}
                    </p>
                  </div>
                  <Badge variant={script.status === "approved" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                    {script.status}
                  </Badge>
                </AppLink>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  const isLoading = job?.status === "running" || job?.status === "pending";
  /** Reels list: featured catalog when data is loaded, or user scrape job paths. */
  const canDisplayJobReels =
    (isFeaturedView && !!featuredData) ||
    (!isFeaturedView &&
      (job?.status === "completed" ||
        ((job?.status === "running" || job?.status === "pending") &&
          reelsData.length > 0)));
  const showUpdatingReelsBanner =
    !isFeaturedView &&
    job?.status === "running" &&
    reelsData.length > 0;
  /* Demo banner removed from UI; re-enable by uncommenting this block.
  const showDemoBanner = !!job?.isDemo && !user?.hasDismissedDemoBanner;
  */
  const isFirstVisitDashboard = user?.hasCompletedFirstSpy === false;

  const reelsInSpyWindow =
    !isFeaturedView && typeof job?.reelsInWindow === "number" ? job.reelsInWindow : null;
  const backfilledReelCount =
    reelsInSpyWindow != null && reelsData.length > reelsInSpyWindow
      ? reelsData.length - reelsInSpyWindow
      : 0;

  return (
    <div className="max-w-[1700px] mx-auto px-2 sm:px-0">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="min-w-0">
          {/* Demo banner removed from UI; re-enable by uncommenting this block.
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
          */}
          {/* Header. Featured view (Commit 6) renders a distinct profile
              card with a large avatar + follower / engagement / posting-
              time stats; the user-scrape flow keeps its condensed header.
              The sort/filter/view-toggle cluster on the right is shared. */}
          <div className="mb-6 flex flex-col gap-4">
            {isFeaturedView ? (
              <div className="flex items-start gap-3 min-w-0">
                <Tooltip content="Back">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 mt-1 shrink-0"
                    onClick={handleDashboardBack}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Tooltip>
                {isFeaturedHeaderPending ? (
                  <div
                    className="h-20 w-20 shrink-0 rounded-full bg-muted animate-pulse"
                    aria-hidden
                  />
                ) : (
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-primary/60 to-fuchsia-500/50 flex items-center justify-center text-lg font-semibold text-white">
                    {featuredData?.account.profilePicUrl ? (
                      <img
                        src={featuredData.account.profilePicUrl}
                        alt={`@${featuredData.account.handle}`}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      avatarInitialsFromAccount(
                        featuredData?.account.displayName,
                        featuredData?.account.handle
                      )
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {isFeaturedHeaderPending ? (
                      <div
                        className="h-7 w-40 max-w-[min(100%,20rem)] rounded-md bg-muted animate-pulse"
                        aria-hidden
                      />
                    ) : (
                      <h1 className="text-xl font-semibold tracking-tight text-foreground">
                        {(() => {
                          const h =
                            displayScrapeHandle ||
                            stripAtHandle(job?.handle) ||
                            stripAtHandle(featuredData?.account.handle);
                          return h ? (
                            `@${h}`
                          ) : (
                            <span className="text-muted-foreground" aria-label="Handle loading">
                              ··
                            </span>
                          );
                        })()}
                      </h1>
                    )}
                  </div>
                  {featuredData?.account.displayName && (
                    <p className="text-sm text-muted-foreground">
                      {featuredData.account.displayName}
                    </p>
                  )}
                  {/* Line 2: stats bar. Each segment is conditional so the
                      dot separators never collapse into "• •" when a
                      value is missing (e.g. backfill not yet run). */}
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isFeaturedHeaderPending ? (
                      <span
                        className="inline-block h-4 w-48 max-w-full rounded bg-muted animate-pulse"
                        aria-hidden
                      />
                    ) : (
                      (() => {
                        const segments: React.ReactNode[] = [];
                        if (followerCount > 0) {
                          segments.push(
                            <span key="followers">
                              {formatNumber(followerCount)} followers
                            </span>
                          );
                        }
                        if (featuredData && featuredData.account.avgEngagement > 0) {
                          segments.push(
                            <span key="engagement">
                              {featuredData.account.avgEngagement.toFixed(2)}% avg engagement
                            </span>
                          );
                        }
                        if (featuredData?.account.bestPostingTime) {
                          segments.push(
                            <span key="posting-time">
                              {featuredData.account.bestPostingTime}
                            </span>
                          );
                        }
                        if (segments.length === 0) return null;
                        const joined: React.ReactNode[] = [];
                        segments.forEach((s, i) => {
                          if (i > 0) {
                            joined.push(
                              <span key={`sep-${i}`} className="mx-1.5" aria-hidden>
                                &middot;
                              </span>
                            );
                          }
                          joined.push(s);
                        });
                        return joined;
                      })()
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 gap-3">
                <Tooltip content="Back">
                  <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={handleDashboardBack}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    {isUserJobH1Pending ? (
                      <div
                        className="h-7 w-40 max-w-[min(100%,20rem)] rounded-md bg-muted animate-pulse"
                        aria-hidden
                      />
                    ) : (
                      <h1 className="text-xl font-semibold tracking-tight text-foreground">
                        {(() => {
                          const h = displayScrapeHandle || stripAtHandle(job?.handle);
                          return h ? (
                            `@${h}`
                          ) : (
                            <span className="text-muted-foreground" aria-label="Handle loading">
                              ··
                            </span>
                          );
                        })()}
                      </h1>
                    )}
                    {job && (
                      <Tooltip content="All reels collected. Open Creator Radar and refresh the creator to pull new reels.">
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
                {job && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {job.status === "completed" && reelsLoading && reelsData.length === 0 ? (
                      "Loading reels…"
                    ) : (
                      <>
                        {sortedReels.length}
                        {dateFilter !== "all" ? ` of ${reelsData.length}` : ""} reels
                        {dateFilter !== "all" ? ` (last ${dateFilter} days)` : " collected"}
                      </>
                    )}
                    {followerCount > 0 && job.status === "completed" && !(reelsLoading && reelsData.length === 0) && (
                      <> &middot; {formatNumber(followerCount)} followers</>
                    )}
                  </p>
                )}
                </div>
              </div>
            )}

            <div className="dashboard-toolbar-scroll flex w-full min-w-0 flex-wrap items-center gap-2">
              {canDisplayJobReels && reelsData.length > 0 && (
                <>
                  {!isFirstVisitDashboard ? (
                    <>
                  <Tooltip content="Filter reels by date posted">
                    <div>
                      <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="h-9 w-full min-w-[8.5rem] max-w-[9.5rem] bg-card text-sm sm:w-[150px]">
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
                        <SelectTrigger className="h-9 w-full min-w-0 max-w-full bg-card text-sm sm:min-w-[14rem] sm:max-w-[20rem]">
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
                    </>
                  ) : null}

                  {!isFirstVisitDashboard ? (
                  <Tooltip content="Switch between detailed list and visual grid view">
                    <div className="workspace-view-toggle inline-flex items-center">
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
                  ) : null}

                  {/* Export requires a scrape_job row; hidden in featured
                      view until the catalog is wired into export. */}
                  {!isFeaturedView && (
                    <>
                      <Tooltip
                        content={
                          cachedExportReady
                            ? exportScopePreference === "top_viral_30"
                              ? "Download your saved Top 30 Excel file (no credits)"
                              : "Download your saved Excel file (no credits)"
                            : exportIsStale
                              ? "New reels since last export. Regenerate uses 1 export credit."
                              : exportScopeNeedsPrompt(accountExportReelCount)
                                ? "Export top viral reels or full account to Excel"
                                : "Export reels to Excel with transcripts and filming tips"
                        }
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() => {
                            if (csvLock.locked) {
                              csvLock.requireUpgrade();
                              return;
                            }
                            if (cachedExportReady && exportLatestQuery.data) {
                              exportDownload.mutate({
                                exportJobId: exportLatestQuery.data.exportJobId,
                              });
                              return;
                            }
                            requestExport(false);
                          }}
                          disabled={exportInProgress || exportDownload.isPending}
                        >
                          {exportInProgress ? (
                            <>
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              <span className="hidden sm:inline">{exportProgressLabel}</span>
                            </>
                          ) : cachedExportReady ? (
                            <>
                              <Download className="h-3.5 w-3.5 sm:mr-2" />
                              <span className="hidden sm:inline">Download Excel</span>
                            </>
                          ) : (
                            <>
                              <Download className="h-3.5 w-3.5 sm:mr-2" />
                              <span className="hidden sm:inline">Export Excel</span>
                            </>
                          )}
                        </Button>
                      </Tooltip>

                      {(cachedExportReady || exportIsStale) && !exportInProgress ? (
                        <Tooltip content="Create a fresh export (uses 1 export credit)">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={() => {
                              requestExport(true);
                            }}
                          >
                            Regenerate
                          </Button>
                        </Tooltip>
                      ) : null}

                      {/*
                      Connect to Sheets (UI disabled; re-enable when integration ships)
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
                      */}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {showUpdatingReelsBanner && job && jobId != null ? (
            <ScrapeJobProgressUI
              className="mb-4"
              variant="banner"
              snapshot={snapshotFromProgressRow(
                {
                  handle: job.handle,
                  status: job.status,
                  progressPercent: job.progressPercent ?? 0,
                  reelsFound: Math.max(job.reelsFound ?? 0, reelsData.length),
                  currentStep: job.currentStep,
                  estimatedTotal: job.estimatedTotal,
                  timeframeDays: job.timeframeDays,
                },
                jobId
              )}
            />
          ) : null}

          {!isFeaturedView &&
          job?.status === "completed" &&
          backfilledReelCount > 0 &&
          typeof job.timeframeDays === "number" ? (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm text-foreground">
                Only {reelsInSpyWindow ?? 0} reel{(reelsInSpyWindow ?? 0) === 1 ? "" : "s"} posted in
                the last {job.timeframeDays} days. We added {backfilledReelCount} older reel
                {backfilledReelCount === 1 ? "" : "s"} so you have at least{" "}
                {Math.min(reelsData.length, MIN_SPY_DISPLAY_REELS)} to study.
              </p>
            </div>
          ) : null}

          {canDisplayJobReels && reelsData.length > 0 && dateFilter !== "all" ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Showing {sortedReels.length} of {reelsData.length} reels ({dashboardDateFilterLabel(dateFilter)})
            </p>
          ) : null}

          {/* Loading state (no reels yet) */}
          {isLoading && reelsData.length === 0 && (
            <div className="border border-border/50 bg-card rounded-lg p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-foreground font-medium">Analyzing account...</p>
                  <p className="text-sm text-muted-foreground mt-1">{job?.totalReels || 0} reels found so far</p>
                </div>
              </div>
            </div>
          )}

          {/* Failed state */}
          {job?.status === "failed" && (
            <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <p className="text-destructive font-medium">Could not load account</p>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {job.errorMessage || "An unknown error occurred"}
                </p>
                <Button variant="outline" onClick={() => setLocation("/")}>
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Reels list loading: 95% until the list query finishes (then 100% = data rendered) */}
          {job?.status === "completed" && reelsLoading && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: "95%" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Almost there...</p>
              </div>
              <div className="space-y-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border/30 p-2 sm:p-3 bg-card/50 flex items-center gap-2 sm:gap-3 animate-pulse"
                  >
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

          {isFirstVisitDashboard && canDisplayJobReels && sortedReels.length > 0 && (
            <div className="mb-5 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3">
              <p className="text-sm font-medium text-foreground">Pick a Reel to remake</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reels are sorted by what performed best. Tap one to see the hook, then hit{" "}
                <span className="font-medium text-foreground">Remake in your voice</span>.
              </p>
            </div>
          )}

          {/* Reels list */}
          {canDisplayJobReels && sortedReels.length > 0 && viewMode === "list" && (
            <div key="list" className="space-y-3">
              {sortedReels.map((reel, index) => {
                const isExpanded = expandedReelId === reel.id;
                const hasTranscription = reel.transcription?.status === "completed";
                const isNoSpeech = transcriptionIsNoSpeech(reel.transcription);
                const isProcessing = reel.transcription?.status === "processing" || pendingTranscriptions.has(reel.id);
                const isFailed = reel.transcription?.status === "failed" && !pendingTranscriptions.has(reel.id);
                const isSaved = !!savedMap[reel.id];
                const isTxQueued =
                  isProcessing &&
                  !isFeaturedView &&
                  (reel.transcription?.status !== "processing" || !reel.transcription?.startedAt);
                const recreateSt = reelRecreateState(
                  recreateMap[reel.id as keyof typeof recreateMap] as RecreateBatchEntry | undefined
                );
                const idleNotRemakeable =
                  mergeRemakeability(reel.transcription, reel).notRemakeable &&
                  hasTranscription &&
                  !isNoSpeech &&
                  recreateSt === "none";

                const librarySource: LibraryRemakeSource | null = isFeaturedView
                  ? { source: "featured", featuredReelId: reel.id }
                  : jobId != null
                    ? { source: "user", reelId: reel.id, jobId: jobId }
                    : null;
                const hookState =
                  librarySource != null
                    ? getRemakeState(libraryRemakeKey(librarySource))
                    : null;
                const isProcessingForStrip =
                  isProcessing || hookState?.stage === "transcribing";
                const batchEntry = recreateMap[reel.id as keyof typeof recreateMap] as
                  | RecreateBatchEntry
                  | undefined;
                const alreadyTranscribed = hasTranscription && !isNoSpeech;
                const oneClickRemake =
                  librarySource != null && hookState != null
                    ? buildLibraryOneClickRemake({
                        openScriptReelId: reel.id,
                        jobId: librarySource.source === "user" ? jobId! : undefined,
                        isNoSpeech,
                        alreadyTranscribed,
                        idleNotRemakeable,
                        classificationReason: reel.classificationReason ?? undefined,
                        classification: reelClassificationFromRow(reel),
                        batchRecreateSt: recreateSt,
                        batchEntry,
                        hookState,
                        librarySource,
                        startRemake,
                        retryRemake,
                        startInspirationSave,
                        triggerOpenMyScript,
                      })
                    : undefined;

                return (
                  <div
                    key={reel.id}
                    ref={setReelRowRef(reel.id)}
                    className={`workspace-reel-card overflow-hidden ${
                      isFirstVisitDashboard && index === 0
                        ? "rounded-xl border-2 border-primary/40 bg-primary/5"
                        : ""
                    }`}
                  >
                    {/* Reel Row */}
                    <div
                      className={`${
                        isFirstVisitDashboard
                          ? "flex flex-col gap-3 p-3 hover:bg-accent/25 transition-colors cursor-pointer"
                          : `flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-3 hover:bg-accent/25 transition-colors cursor-pointer ${
                              isExpanded ? "bg-accent/20 border-b border-border/40" : ""
                            }`
                      }`}
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedReelId(null);
                        } else {
                          setExpandedReelId(reel.id);
                        }
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
                      {/* Rank */}
                      <span className="hidden w-5 shrink-0 text-right font-mono text-sm text-muted-foreground sm:block sm:w-6">
                        {index + 1}
                      </span>

                      {/* Thumbnail */}
                      <div className="relative h-[4.5rem] w-14 shrink-0 overflow-hidden rounded-md bg-muted">
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
                        {isFirstVisitDashboard && index === 0 ? (
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Start here
                          </p>
                        ) : null}
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm text-foreground line-clamp-1 leading-snug">
                            {reel.caption || <span className="text-muted-foreground italic">No caption</span>}
                          </p>
                          {hasTranscription && !isNoSpeech && (
                            <span className="shrink-0 text-[9px] font-medium bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">Transcribed</span>
                          )}
                          {isNoSpeech && (
                            <span className="shrink-0 text-[9px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">No voice</span>
                          )}
                          {isProcessing && (
                            <span className="shrink-0 text-[9px] font-medium bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full animate-pulse">Processing</span>
                          )}
                          {isFailed && (
                            <span className="shrink-0 text-[9px] font-medium bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">Failed</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <V13ReelClassificationBadges
                            niche={null}
                            hookPattern={reel.hookPattern}
                            productionFormat={
                              "productionFormat" in reel ? reel.productionFormat : null
                            }
                            viralFlag={reel.viralFlag}
                            confidence={reel.confidence}
                          />
                          <BrandCoachBadge
                            source={
                              isFeaturedView
                                ? { kind: "featured", featuredReelId: reel.id }
                                : { kind: "reel", reelId: reel.id }
                            }
                            hasTranscript={hasTranscription && !isNoSpeech}
                            prefetchedScore={
                              isFeaturedView
                                ? brandCoachBatch.prefetchedForFeatured(reel.id)
                                : brandCoachBatch.prefetchedForReel(reel.id)
                            }
                          />
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
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatPostedTime(reel.postedAt, userTimezone)}
                          </span>
                        </div>
                      </div>
                      </div>

                      {!isFirstVisitDashboard ? (
                        <div
                          className="flex w-full shrink-0 flex-col items-stretch gap-1 sm:w-auto sm:min-w-[11rem] sm:self-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ReelActionButtons
                            source={
                              isFeaturedView
                                ? { source: "featured", featuredReelId: reel.id }
                                : { source: "user_job", reelId: reel.id, jobId: jobId! }
                            }
                            reelId={reel.id}
                            reelUrl={reel.reelUrl}
                            isSaved={isSaved}
                            hasTranscription={hasTranscription}
                            isProcessing={isProcessingForStrip}
                            isFailed={isFailed}
                            recreateState={recreateSt}
                            saveBusy={toggleSave.isPending}
                            isQueued={isTxQueued}
                            isNoSpeech={isNoSpeech}
                            oneClickRemake={oneClickRemake}
                            onToggleSave={() => {
                              if (isFeaturedView) {
                                toggleSave.mutate({ featuredReelId: reel.id });
                              } else {
                                toggleSave.mutate({ reelId: reel.id, jobId: jobId! });
                              }
                            }}
                            onTranscribe={() => {}}
                            onExpand={() => setExpandedReelId(reel.id)}
                            onMakeVersion={() => {}}
                            onOpenMyScript={() => {}}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hidden h-8 w-8 shrink-0 p-0 text-muted-foreground sm:inline-flex"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedReelId(isExpanded ? null : reel.id);
                            }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      ) : null}

                      {isFirstVisitDashboard ? (
                        <div className="w-full" onClick={(e) => e.stopPropagation()}>
                          <ReelActionButtons
                            source={
                              isFeaturedView
                                ? { source: "featured", featuredReelId: reel.id }
                                : { source: "user_job", reelId: reel.id, jobId: jobId! }
                            }
                            reelId={reel.id}
                            reelUrl={reel.reelUrl}
                            isSaved={isSaved}
                            hasTranscription={hasTranscription}
                            isProcessing={isProcessingForStrip}
                            isFailed={isFailed}
                            recreateState={recreateSt}
                            saveBusy={toggleSave.isPending}
                            isQueued={isTxQueued}
                            isNoSpeech={isNoSpeech}
                            oneClickRemake={oneClickRemake}
                            onToggleSave={() => {
                              if (isFeaturedView) {
                                toggleSave.mutate({ featuredReelId: reel.id });
                              } else {
                                toggleSave.mutate({ reelId: reel.id, jobId: jobId! });
                              }
                            }}
                            onTranscribe={() => {}}
                            onExpand={() => setExpandedReelId(reel.id)}
                            onMakeVersion={() => {}}
                            onOpenMyScript={() => {}}
                          />
                        </div>
                      ) : null}
                    </div>

                    {/* Expanded inline workflow panel  -  same component now
                        serves both sources; Commit 3b teaches the inner
                        tRPC mutations about `featuredReelId`. */}
                    {isExpanded && (
                      isFeaturedView ? (
                        <InlineWorkflow
                          reelSource="featured"
                          featuredReelId={reel.id}
                          handle={displayScrapeHandle || job?.handle || ""}
                          reelCaption={reel.caption ?? undefined}
                          hasTranscription={hasTranscription}
                          isProcessing={isProcessing}
                          isTranscriptionQueued={isTxQueued}
                          isNoSpeech={isNoSpeech}
                          inspirationPanelVariant="dashboard"
                          listRemakeHint={mergeRemakeability(reel.transcription, reel)}
                          reelClassification={reel}
                          onSaveForInspiration={() =>
                            toggleSave.mutate({ featuredReelId: reel.id })
                          }
                          saveForInspirationBusy={toggleSave.isPending}
                          inspirationReelIsSaved={isSaved}
                          onTranscribe={() =>
                            runTranscribeClick(reel.id, { mode: "featured", expand: false })
                          }
                          userTimezone={userTimezone}
                          postedAt={reel.postedAt}
                          recreateEntrySignal={
                            recreatePulse?.reelId === reel.id
                              ? {
                                  nonce: recreatePulse.nonce,
                                  openScriptId: recreatePulse.openScriptId,
                                }
                              : undefined
                          }
                        />
                      ) : (
                        <InlineWorkflow
                          reelSource="user_job"
                          reelId={reel.id}
                          handle={displayScrapeHandle || job?.handle || ""}
                          reelCaption={reel.caption ?? undefined}
                          hasTranscription={hasTranscription}
                          isProcessing={isProcessing}
                          isTranscriptionQueued={isTxQueued}
                          isNoSpeech={isNoSpeech}
                          inspirationPanelVariant="dashboard"
                          listRemakeHint={mergeRemakeability(reel.transcription, reel)}
                          reelClassification={reel}
                          onSaveForInspiration={() =>
                            toggleSave.mutate({ reelId: reel.id, jobId: jobId! })
                          }
                          saveForInspirationBusy={toggleSave.isPending}
                          inspirationReelIsSaved={isSaved}
                          onTranscribe={() =>
                            runTranscribeClick(reel.id, { mode: "user", expand: false })
                          }
                          userTimezone={userTimezone}
                          postedAt={reel.postedAt}
                          recreateEntrySignal={
                            recreatePulse?.reelId === reel.id
                              ? {
                                  nonce: recreatePulse.nonce,
                                  openScriptId: recreatePulse.openScriptId,
                                }
                              : undefined
                          }
                        />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Grid view  -  same actions as List; full workflow opens in a dialog (Bugs #44-46 tier 3). */}
          {canDisplayJobReels && sortedReels.length > 0 && viewMode === "grid" && (
            <div key="grid" className="space-y-3">
              <div className={WORKSPACE_REEL_GRID_CLASS}>
                {sortedReels.map((reel, index) => {
                  const isModalOpen = gridModalReelId === reel.id;
                  const hasTranscription = reel.transcription?.status === "completed";
                  const isNoSpeech = transcriptionIsNoSpeech(reel.transcription);
                  const isProcessing = reel.transcription?.status === "processing" || pendingTranscriptions.has(reel.id);
                  const isFailed = reel.transcription?.status === "failed" && !pendingTranscriptions.has(reel.id);
                  const isSaved = !!savedMap[reel.id];
                  const isTxQueued =
                    isProcessing &&
                    !isFeaturedView &&
                    (reel.transcription?.status !== "processing" || !reel.transcription?.startedAt);
                  const transcribeAtCap = transcribeInFlightRef.current >= 5;

                  const recreateSt = reelRecreateState(
                    recreateMap[reel.id as keyof typeof recreateMap] as RecreateBatchEntry | undefined
                  );
                  const idleNotRemakeable =
                    mergeRemakeability(reel.transcription, reel).notRemakeable &&
                    hasTranscription &&
                    !isNoSpeech &&
                    recreateSt === "none";

                  const source: ReelActionSource = isFeaturedView
                    ? { source: "featured", featuredReelId: reel.id }
                    : { source: "user_job", reelId: reel.id, jobId: jobId! };

                  const librarySource: LibraryRemakeSource | null = isFeaturedView
                    ? { source: "featured", featuredReelId: reel.id }
                    : jobId != null
                      ? { source: "user", reelId: reel.id, jobId: jobId }
                      : null;
                  const hookState =
                    librarySource != null
                      ? getRemakeState(libraryRemakeKey(librarySource))
                      : null;
                  const isProcessingForTile =
                    isProcessing || hookState?.stage === "transcribing";
                  const batchEntry = recreateMap[reel.id as keyof typeof recreateMap] as
                    | RecreateBatchEntry
                    | undefined;
                  const alreadyTranscribed = hasTranscription && !isNoSpeech;
                  const oneClickRemake =
                    librarySource != null && hookState != null
                      ? buildLibraryOneClickRemake({
                          openScriptReelId: reel.id,
                          jobId: librarySource.source === "user" ? jobId! : undefined,
                          isNoSpeech,
                          alreadyTranscribed,
                          idleNotRemakeable,
                          classificationReason: reel.classificationReason ?? undefined,
                          classification: reelClassificationFromRow(reel),
                          batchRecreateSt: recreateSt,
                          batchEntry,
                          hookState,
                          librarySource,
                          startRemake,
                          retryRemake,
                          startInspirationSave,
                          triggerOpenMyScript,
                        })
                      : undefined;

                  return (
                    <div key={reel.id} ref={setReelRowRef(reel.id)}>
                      <WorkspaceReelGridTile
                        className={
                          isFirstVisitDashboard && index === 0
                            ? "rounded-xl ring-2 ring-primary/40"
                            : undefined
                        }
                        interactiveMedia
                        isActive={isModalOpen}
                        index={index}
                        thumbnailUrl={reel.thumbnailUrl}
                        videoUrl={reel.videoUrl}
                        shortcode={reel.shortcode}
                        reelId={reel.id}
                        engagementRate={reel.engagementRate}
                        duration={reel.duration}
                        reelUrl={reel.reelUrl}
                        onMediaClick={() => setGridModalReelId(reel.id)}
                        highlightBanner={
                          isFirstVisitDashboard && index === 0 ? "Start here" : null
                        }
                        topRight={
                          <button
                              type="button"
                              className={`rounded-full p-1.5 backdrop-blur transition-colors ${
                                isSaved
                                  ? "bg-emerald-500/90 text-white hover:bg-emerald-500"
                                  : "bg-black/55 text-white/90 hover:bg-black/75"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isFeaturedView) {
                                  toggleSave.mutate({ featuredReelId: reel.id });
                                } else {
                                  toggleSave.mutate({ reelId: reel.id, jobId: jobId! });
                                }
                              }}
                              disabled={toggleSave.isPending}
                              title={isSaved ? "Remove from saved" : "Save reel"}
                              aria-label={isSaved ? "Remove from saved" : "Save reel"}
                            >
                              {isSaved ? (
                                <BookmarkCheck className="h-3.5 w-3.5" />
                              ) : (
                                <Bookmark className="h-3.5 w-3.5" />
                              )}
                            </button>
                        }
                        statusChip={
                          hasTranscription && !isNoSpeech ? (
                            <span className="rounded bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
                              Transcribed
                            </span>
                          ) : isNoSpeech ? (
                            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                              No voice
                            </span>
                          ) : isProcessingForTile ? (
                            <span className="animate-pulse rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                              Processing
                            </span>
                          ) : null
                        }
                        badges={
                          <div className="flex flex-wrap items-center gap-1.5">
                            <V13ReelClassificationBadges
                              niche={null}
                              hookPattern={reel.hookPattern}
                              productionFormat={
                                "productionFormat" in reel ? reel.productionFormat : null
                              }
                              viralFlag={reel.viralFlag}
                              confidence={reel.confidence}
                            />
                            <BrandCoachBadge
                              source={
                                isFeaturedView
                                  ? { kind: "featured", featuredReelId: reel.id }
                                  : { kind: "reel", reelId: reel.id }
                              }
                              hasTranscript={hasTranscription && !isNoSpeech}
                              prefetchedScore={
                                isFeaturedView
                                  ? brandCoachBatch.prefetchedForFeatured(reel.id)
                                  : brandCoachBatch.prefetchedForReel(reel.id)
                              }
                            />
                          </div>
                        }
                        caption={
                          <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
                            {reel.caption || (
                              <span className="italic text-muted-foreground">No caption</span>
                            )}
                          </p>
                        }
                        stats={
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>{formatNumber(reel.viewCount)} views</span>
                            <span aria-hidden>·</span>
                            <span>{formatNumber(reel.likeCount)} likes</span>
                            <span aria-hidden>·</span>
                            <span>{formatNumber(reel.commentCount)} comments</span>
                            {reel.engagementRate > 0 && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="font-medium text-emerald-400">
                                  {reel.engagementRate.toFixed(2)}%
                                </span>
                              </>
                            )}
                            <span aria-hidden>·</span>
                            <span className="text-muted-foreground">
                              {formatPostedTime(reel.postedAt, userTimezone)}
                            </span>
                          </div>
                        }
                        actions={
                          oneClickRemake ? (
                            <ReelActionButtons
                              source={source}
                              reelId={reel.id}
                              reelUrl={reel.reelUrl}
                              isSaved={isSaved}
                              hasTranscription={hasTranscription}
                              isProcessing={isProcessingForTile}
                              isFailed={isFailed}
                              recreateState={recreateSt}
                              isQueued={isTxQueued}
                              isNoSpeech={isNoSpeech}
                              hideBookmark
                              hideExternalLink
                              oneClickRemake={oneClickRemake}
                              onToggleSave={() =>
                                isFeaturedView
                                  ? toggleSave.mutate({ featuredReelId: reel.id })
                                  : toggleSave.mutate({ reelId: reel.id, jobId: jobId! })
                              }
                              onTranscribe={() => {}}
                              onExpand={() => setGridModalReelId(reel.id)}
                              onMakeVersion={() => {}}
                              onOpenMyScript={() => {}}
                            />
                          ) : null
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state - only show when reels have loaded but are empty */}
          {job?.status === "completed" && !reelsLoading && sortedReels.length === 0 && reelsData.length > 0 && dateFilter !== "all" ? (
            <div className="border border-border/50 bg-card rounded-lg p-8">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <Film className="h-12 w-12 text-muted-foreground/30" />
                <div className="space-y-2 max-w-md">
                  <p className="text-foreground font-medium">
                    No reels match {dashboardDateFilterLabel(dateFilter)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This spy has {reelsData.length} reel{reelsData.length === 1 ? "" : "s"} total.
                    Widen the date filter to see them.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={resetDashboardFilters}>
                  Show all reels
                </Button>
              </div>
            </div>
          ) : null}

          {job?.status === "completed" && !reelsLoading && sortedReels.length === 0 && reelsData.length === 0 ? (
            <div className="border border-border/50 bg-card rounded-lg p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <Film className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-muted-foreground text-center max-w-md">
                  No reels found for @{(displayScrapeHandle || job.handle)}
                  {typeof job.timeframeDays === "number" ? ` in the last ${job.timeframeDays} days.` : "."}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <aside className="min-w-0 w-full space-y-4 border-t border-border/40 pt-6 lg:border-t-0 lg:pt-0 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {!sidebarContentReady ? (
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
              {sidebarSyncRefreshing && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  <p className="text-[11px] text-muted-foreground">
                    Refreshing while reels update. Sidebar stays available from your last sync.
                  </p>
                </div>
              )}
              {showRelatedPanel && !isFirstVisitDashboard && (
                relatedPanelLoading ? (
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <div className="h-5 w-48 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-28 bg-muted/80 rounded mt-2 animate-pulse" />
                    <div className="space-y-2 mt-4">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={idx} className="h-12 rounded-lg bg-muted/60 animate-pulse" />
                      ))}
                    </div>
                  </div>
                ) : showRelatedFromPicks ? (
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">
                      Related <em className="text-primary not-italic">creators</em>
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">From your picks</p>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Creators you chose during onboarding. Open their featured dashboards to compare.
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {creatorsByHandlesQuery.data?.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            posthog?.capture("related_creator_clicked", {
                              panel: "onboarding_picks",
                              from_creator_handle: normalizeAnalyticsHandle(
                                displayScrapeHandle || job?.handle || ""
                              ),
                              to_creator_handle: normalizeAnalyticsHandle(c.handle),
                              from_niche: nicheSlugForSidebar ?? null,
                            });
                            setLocation(`/dashboard?featuredAccountId=${c.id}`);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg border border-border/50 bg-background/50 p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/60 to-fuchsia-500/50 text-[10px] font-semibold text-white">
                            {c.profilePicUrl ? (
                              <img
                                src={c.profilePicUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
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
                              <span className="font-mono text-emerald-400">
                                {c.avgEngagementRate.toFixed(2)}%
                              </span>
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">
                      Related <em className="text-primary not-italic">creators</em>
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">Top creators in this niche</p>
                    {sidebarNicheLabel && (
                      <div className="mt-1 inline-block rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        {sidebarNicheLabel}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Also spying on <span className="text-foreground">@{(displayScrapeHandle || job?.handle || "")}</span>? Here
                      are more creators in the same niche.
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {relatedCreatorsQuery.data?.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (job?.handle && nicheSlugForSidebar) {
                              posthog?.capture("related_creator_clicked", {
                                panel: "niche_fallback",
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
                              <img
                                src={c.profilePicUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
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
                              <span className="font-mono text-emerald-400">
                                {c.avgEngagementRate.toFixed(2)}%
                              </span>
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}

              {showGoingViralPanel && (
                goingViralQuery.isPending ? (
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <div className="h-5 w-44 bg-muted rounded animate-pulse" />
                    <div className="mt-3 space-y-2">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="h-16 rounded-lg bg-muted/60 animate-pulse" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/40 bg-card p-4">
                    <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">
                      Going <em className="text-primary not-italic">viral</em> now
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      High-view Reels in your niches (last 7 days)
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {goingViralQuery.data?.map((r) => {
                        const captionText = (r.caption || "").trim();
                        return (
                        <button
                          key={r.reelId}
                          type="button"
                          onClick={() =>
                            setLocation(
                              `/dashboard?featuredAccountId=${r.featuredAccountId}&featuredReelId=${r.reelId}`
                            )
                          }
                          className="flex w-full items-center gap-2.5 rounded-lg border border-border/50 bg-background/50 p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                        >
                          <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                            {r.thumbnailUrl ? (
                              <img
                                src={r.thumbnailUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Film className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-medium text-foreground leading-snug">
                              {captionText || `Viral Reel · @${r.creatorHandle}`}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              @{r.creatorHandle} · {formatNumber(r.viewCount)} views
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )
              )}

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

      <GridReelWorkflowDialog
        open={gridModalReel != null}
        onOpenChange={(open) => {
          if (!open) setGridModalReelId(null);
        }}
        reel={
          gridModalReel
            ? {
                id: gridModalReel.id,
                reelId: gridModalReel.id,
                shortcode: gridModalReel.shortcode,
                caption: gridModalReel.caption,
                thumbnailUrl: gridModalReel.thumbnailUrl,
                videoUrl: gridModalReel.videoUrl ?? "",
                viewCount: gridModalReel.viewCount,
                likeCount: gridModalReel.likeCount,
                commentCount: gridModalReel.commentCount,
                engagementRate: gridModalReel.engagementRate,
                postedAt: gridModalReel.postedAt,
                duration: gridModalReel.duration,
                niche: gridModalReel.niche ?? null,
                hookPattern: gridModalReel.hookPattern ?? null,
                viralFlag: gridModalReel.viralFlag ?? false,
                confidence: gridModalReel.confidence ?? null,
              }
            : null
        }
        userTimezone={userTimezone}
      >
        {gridModalReel
          ? (() => {
              const reel = gridModalReel;
              const hasTranscription = reel.transcription?.status === "completed";
              const isNoSpeech = transcriptionIsNoSpeech(reel.transcription);
              const isProcessing =
                reel.transcription?.status === "processing" || pendingTranscriptions.has(reel.id);
              const isTxQueued =
                isProcessing &&
                !isFeaturedView &&
                (reel.transcription?.status !== "processing" || !reel.transcription?.startedAt);
              const isSaved = !!savedMap[reel.id];
              return isFeaturedView ? (
                <InlineWorkflow
                  reelSource="featured"
                  featuredReelId={reel.id}
                  handle={displayScrapeHandle || job?.handle || ""}
                  reelCaption={reel.caption ?? undefined}
                  hasTranscription={hasTranscription}
                  isProcessing={isProcessing}
                  isTranscriptionQueued={isTxQueued}
                  isNoSpeech={isNoSpeech}
                  inspirationPanelVariant="dashboard"
                  listRemakeHint={mergeRemakeability(reel.transcription, reel)}
                  reelClassification={reel}
                  onSaveForInspiration={() =>
                    toggleSave.mutate({ featuredReelId: reel.id })
                  }
                  saveForInspirationBusy={toggleSave.isPending}
                  inspirationReelIsSaved={isSaved}
                  onTranscribe={() =>
                    runTranscribeClick(reel.id, { mode: "featured", expand: false })
                  }
                  userTimezone={userTimezone}
                  postedAt={reel.postedAt}
                  recreateEntrySignal={
                    recreatePulse?.reelId === reel.id
                      ? {
                          nonce: recreatePulse.nonce,
                          openScriptId: recreatePulse.openScriptId,
                        }
                      : undefined
                  }
                  onRemakeSaved={() => setGridModalReelId(null)}
                />
              ) : (
                <InlineWorkflow
                  reelSource="user_job"
                  reelId={reel.id}
                  handle={displayScrapeHandle || job?.handle || ""}
                  reelCaption={reel.caption ?? undefined}
                  hasTranscription={hasTranscription}
                  isProcessing={isProcessing}
                  isTranscriptionQueued={isTxQueued}
                  isNoSpeech={isNoSpeech}
                  inspirationPanelVariant="dashboard"
                  listRemakeHint={mergeRemakeability(reel.transcription, reel)}
                  reelClassification={reel}
                  onSaveForInspiration={() =>
                    toggleSave.mutate({ reelId: reel.id, jobId: jobId! })
                  }
                  saveForInspirationBusy={toggleSave.isPending}
                  inspirationReelIsSaved={isSaved}
                  onTranscribe={() =>
                    runTranscribeClick(reel.id, { mode: "user", expand: false })
                  }
                  userTimezone={userTimezone}
                  postedAt={reel.postedAt}
                  recreateEntrySignal={
                    recreatePulse?.reelId === reel.id
                      ? {
                          nonce: recreatePulse.nonce,
                          openScriptId: recreatePulse.openScriptId,
                        }
                      : undefined
                  }
                  onRemakeSaved={() => setGridModalReelId(null)}
                />
              );
            })()
          : null}
      </GridReelWorkflowDialog>

      {!isFeaturedView && jobId != null ? (
        <ExportScopeDialog
          open={showExportScopeDialog}
          onOpenChange={setShowExportScopeDialog}
          reelCount={accountExportReelCount}
          isRegenerate={exportScopeRegenerate}
          isPending={exportStart.isPending}
          onConfirm={(scope) => beginExportJob(exportScopeRegenerate, scope)}
        />
      ) : null}

      {/*
      Export to Google Sheets dialog (UI disabled; re-enable when integration ships)
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
      */}
    </div>
  );
}

