import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  AtSign,
  Hash,
  Link2,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  Clock,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Loader2,
  FileText,
  Sparkles,
  AlertCircle,
  Play,
  Wand2,
  Check,
  BadgeCheck,
  Lock,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  SearchInlineWorkflow,
  formatNumber,
  formatDuration,
  formatPostedTime,
  type Segment,
} from "@/components/InlineWorkflow";
import { useUsageGate } from "@/hooks/useUsageGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";

// ── Constants ──

type SortField = "viewCount" | "likeCount" | "commentCount" | "engagementRate" | "postedAt" | "duration";
type SortDir = "asc" | "desc";

interface SearchResult {
  shortcode: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  videoUrl: string;
  reelUrl: string;
  duration: number;
  postedAt: string;
  ownerUsername: string;
  ownerFullName: string;
  ownerProfilePicUrl: string;
  ownerFollowerCount: number;
  engagementRate: number;
}

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ══════════════════════════════════════════════════════════════
// Main SearchReels Component
// ══════════════════════════════════════════════════════════════

export default function SearchReels() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"keyword" | "handle" | "url">("keyword");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sortField, setSortField] = useState<SortField>("viewCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // URL tab state
  const [urlInput, setUrlInput] = useState("");
  const [urlErrors, setUrlErrors] = useState<string[]>([]);
  const [urlProgress, setUrlProgress] = useState(0);
  const [urlTotalCount, setUrlTotalCount] = useState(0);
  const [urlFetchedCount, setUrlFetchedCount] = useState(0);
  const urlProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Handle profile preview state
  const [handleInput, setHandleInput] = useState("");
  const [debouncedHandle, setDebouncedHandle] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transcription state per reel (for search results not in DB)
  const [transcripts, setTranscripts] = useState<Record<string, { text: string; segments: Segment[] }>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});

  const intelligence = useMemo(() => {
    if (searchType !== "handle" || results.length === 0) return null;

    // Average views, likes, comments
    const avgViews = Math.round(results.reduce((sum, r) => sum + r.viewCount, 0) / results.length);
    const avgLikes = Math.round(results.reduce((sum, r) => sum + r.likeCount, 0) / results.length);
    const avgComments = Math.round(results.reduce((sum, r) => sum + r.commentCount, 0) / results.length);

    // Engagement rate
    const engagementRate = avgViews > 0 ? ((avgLikes + avgComments) / avgViews * 100).toFixed(2) : "0";

    // Posting frequency - reels per week
    const dates = results.map(r => new Date(r.postedAt)).sort((a, b) => a.getTime() - b.getTime());
    const daySpan = dates.length > 1 ? (dates[dates.length - 1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24) : 30;
    const reelsPerWeek = daySpan > 0 ? ((results.length / daySpan) * 7).toFixed(1) : "N/A";

    // Best day to post - from top 5 reels by views
    const top5 = [...results].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayCounts: Record<number, number> = {};
    top5.forEach(r => {
      const day = new Date(r.postedAt).getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const bestDayNum = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const bestDay = bestDayNum !== undefined ? days[Number(bestDayNum)] : "N/A";

    // Best time to post - from top 5 reels
    const hourCounts: Record<number, number> = {};
    top5.forEach(r => {
      const hour = new Date(r.postedAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const bestHourNum = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const bestHour = bestHourNum !== undefined ?
      (Number(bestHourNum) === 0 ? "12am" : Number(bestHourNum) < 12 ? `${bestHourNum}am` : Number(bestHourNum) === 12 ? "12pm" : `${Number(bestHourNum) - 12}pm`)
      : "N/A";

    // Short vs long performance
    const shortReels = results.filter(r => r.duration <= 30);
    const longReels = results.filter(r => r.duration > 30);
    const avgShortViews = shortReels.length > 0 ? Math.round(shortReels.reduce((sum, r) => sum + r.viewCount, 0) / shortReels.length) : 0;
    const avgLongViews = longReels.length > 0 ? Math.round(longReels.reduce((sum, r) => sum + r.viewCount, 0) / longReels.length) : 0;
    const bestFormat = shortReels.length === 0 ? "Long (30s+)" : longReels.length === 0 ? "Short (under 30s)" : avgShortViews > avgLongViews ? "Short (under 30s)" : "Long (30s+)";

    // View velocity - compare newest 3 vs oldest 3
    const sorted = [...results].sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
    const oldest3 = sorted.slice(0, 3);
    const newest3 = sorted.slice(-3);
    const avgOldViews = Math.round(oldest3.reduce((sum, r) => sum + r.viewCount, 0) / oldest3.length);
    const avgNewViews = Math.round(newest3.reduce((sum, r) => sum + r.viewCount, 0) / newest3.length);
    const trend = avgNewViews > avgOldViews * 1.1 ? "Growing" : avgNewViews < avgOldViews * 0.9 ? "Declining" : "Stable";
    const trendColor = trend === "Growing" ? "text-green-400" : trend === "Declining" ? "text-red-400" : "text-yellow-400";

    return { avgViews, avgLikes, avgComments, engagementRate, reelsPerWeek, bestDay, bestHour, bestFormat, trend, trendColor };
  }, [results, searchType]);

  const inputRef = useRef<HTMLInputElement>(null);
  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";
  const [, setLocation] = useLocation();

  // Usage gates
  const searchGate = useUsageGate("searchCount");
  const transcribeGate = useUsageGate("transcribeCount");
  const recreateGate = useUsageGate("recreateCount");

  const keywordSearch = trpc.search.byKeyword.useMutation();
  const handleSearchMut = trpc.search.byHandle.useMutation();
  const urlSearch = trpc.search.byUrl.useMutation();
  const transcribeMutation = trpc.search.transcribe.useMutation();
  const recreateMutation = trpc.search.recreate.useMutation();

  const isSearching = keywordSearch.isPending || handleSearchMut.isPending || urlSearch.isPending;

  // Profile preview for handle search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const cleanHandle = handleInput.replace(/^@/, "").trim();
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
  }, [handleInput]);

  const profileQuery = trpc.search.profilePreview.useQuery(
    { handle: debouncedHandle },
    {
      enabled: debouncedHandle.length >= 2 && searchType === "handle",
      retry: false,
      staleTime: 60_000,
    }
  );

  const profile = profileQuery.data;
  const isLoadingProfile = profileQuery.isFetching;
  const profileFound = profile?.found === true;
  const profileError = profile?.found === false ? profile.error : null;

  // ── Search Handlers ──

  const doKeywordSearch = useCallback(() => {
    const q = query.trim();
    if (!q) return;

    if (!searchGate.allowed) {
      toast.error(`Search limit reached (${searchGate.used}/${searchGate.limit})`, {
        description: "Upgrade your plan for more searches.",
        action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
      });
      return;
    }

    setResults([]);
    setHasSearched(true);
    setExpandedRow(null);

    keywordSearch.mutate(
      { keyword: q, maxResults: 50 },
      {
        onSuccess: (data) => {
          setResults(data.reels as any);
          if (data.reels.length === 0) {
            toast.info("No reels found for this keyword. Try a different search term.");
          } else {
            const creators = (data as any).suggestedCreators;
            if (creators && creators.length > 0) {
              toast.success(`Found ${data.reels.length} reels from ${creators.length} creators for "${data.query}"`);
            } else {
              toast.success(`Found ${data.reels.length} reels for "${data.query}"`);
            }
          }
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }, [query, keywordSearch]);

  const doHandleSearch = useCallback(() => {
    const h = handleInput.replace(/^@/, "").trim();
    if (!h) return;

    if (profile?.found && profile.isPrivate) {
      toast.error("This account is private and cannot be searched.");
      return;
    }

    if (!searchGate.allowed) {
      toast.error(`Search limit reached (${searchGate.used}/${searchGate.limit})`, {
        description: "Upgrade your plan for more searches.",
        action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
      });
      return;
    }

    setResults([]);
    setHasSearched(true);
    setExpandedRow(null);

    handleSearchMut.mutate(
      { handle: h, maxResults: 50 },
      {
        onSuccess: (data) => {
          setResults(data.reels as any);
          if (data.reels.length === 0) {
            toast.info("No reels found for this creator.");
          } else {
            toast.success(`Found ${data.reels.length} reels from @${data.query}`);
          }
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }, [handleInput, handleSearchMut, profile]);

  const doUrlSearch = useCallback(() => {
    const lines = urlInput
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast.error("Please paste at least one Instagram reel URL.");
      return;
    }
    if (lines.length > 20) {
      toast.error("Maximum 20 URLs allowed at once.");
      return;
    }

    // Basic URL validation
    const validUrls: string[] = [];
    const invalidUrls: string[] = [];
    for (const line of lines) {
      if (line.includes("instagram.com") && (line.includes("/reel/") || line.includes("/reels/") || line.includes("/p/"))) {
        validUrls.push(line.startsWith("http") ? line : `https://${line}`);
      } else {
        invalidUrls.push(line);
      }
    }

    if (invalidUrls.length > 0) {
      toast.warning(`${invalidUrls.length} invalid URL(s) skipped. Use Instagram reel URLs.`);
    }
    if (validUrls.length === 0) {
      toast.error("No valid Instagram reel URLs found.");
      return;
    }

    setResults([]);
    setUrlErrors([]);
    setHasSearched(true);
    setExpandedRow(null);

    // Start progress tracking
    const totalUrls = validUrls.length;
    setUrlTotalCount(totalUrls);
    setUrlFetchedCount(0);
    setUrlProgress(0);

    // Simulate incremental progress (~1s per URL on the backend)
    let simulated = 0;
    if (urlProgressTimer.current) clearInterval(urlProgressTimer.current);
    urlProgressTimer.current = setInterval(() => {
      simulated += 1;
      if (simulated >= totalUrls) {
        // Cap at 95% until actual completion
        setUrlProgress(95);
        setUrlFetchedCount(totalUrls - 1);
      } else {
        const pct = Math.round((simulated / totalUrls) * 90);
        setUrlProgress(pct);
        setUrlFetchedCount(simulated);
      }
    }, 1000);

    urlSearch.mutate(
      { urls: validUrls },
      {
        onSuccess: (data) => {
          // Clear progress timer and set to 100%
          if (urlProgressTimer.current) {
            clearInterval(urlProgressTimer.current);
            urlProgressTimer.current = null;
          }
          setUrlProgress(100);
          setUrlFetchedCount(data.totalFetched);

          // Brief delay to show 100% before clearing
          setTimeout(() => {
            setResults(data.reels as any);
            if (data.errors.length > 0) {
              setUrlErrors(data.errors);
            }
            if (data.reels.length === 0) {
              toast.error("Could not fetch any reels from the provided URLs.");
            } else {
              toast.success(`Fetched ${data.totalFetched} of ${data.totalRequested} reels`);
            }
            // Reset progress after results are shown
            setTimeout(() => {
              setUrlProgress(0);
              setUrlTotalCount(0);
              setUrlFetchedCount(0);
            }, 500);
          }, 400);
        },
        onError: (err) => {
          if (urlProgressTimer.current) {
            clearInterval(urlProgressTimer.current);
            urlProgressTimer.current = null;
          }
          setUrlProgress(0);
          setUrlTotalCount(0);
          setUrlFetchedCount(0);
          toast.error(err.message);
        },
      }
    );
  }, [urlInput, urlSearch]);

  const doSearch = useCallback(() => {
    if (searchType === "keyword") doKeywordSearch();
    else if (searchType === "handle") doHandleSearch();
    else doUrlSearch();
  }, [searchType, doKeywordSearch, doHandleSearch, doUrlSearch]);

  // ── Sort ──

  const sortedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortField) {
        case "viewCount": aVal = a.viewCount; bVal = b.viewCount; break;
        case "likeCount": aVal = a.likeCount; bVal = b.likeCount; break;
        case "commentCount": aVal = a.commentCount; bVal = b.commentCount; break;
        case "engagementRate": aVal = a.engagementRate; bVal = b.engagementRate; break;
        case "postedAt": aVal = new Date(a.postedAt).getTime(); bVal = new Date(b.postedAt).getTime(); break;
        case "duration": aVal = a.duration; bVal = b.duration; break;
        default: aVal = a.viewCount; bVal = b.viewCount;
      }

      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [results, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />;
  };

  // ── Transcribe handler ──

  const handleTranscribe = useCallback((reel: SearchResult) => {
    if (transcripts[reel.shortcode]) {
      setExpandedRow((prev) => (prev === reel.shortcode ? null : reel.shortcode));
      return;
    }

    setTranscribing((prev) => ({ ...prev, [reel.shortcode]: true }));
    setExpandedRow(reel.shortcode);

    transcribeMutation.mutate(
      { shortcode: reel.shortcode, videoUrl: reel.videoUrl || undefined },
      {
        onSuccess: (data) => {
          setTranscripts((prev) => ({
            ...prev,
            [reel.shortcode]: { text: data.transcript, segments: data.segments as Segment[] },
          }));
          setTranscribing((prev) => ({ ...prev, [reel.shortcode]: false }));
          toast.success(`✅ @${reel.ownerUsername} - transcription complete! Scroll down on that reel to see the script.`, { duration: 6000 });
          setTimeout(() => {
            document.getElementById(`transcript-${reel.shortcode}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 500);
        },
        onError: (err) => {
          setTranscribing((prev) => ({ ...prev, [reel.shortcode]: false }));
          toast.error(`Transcription failed: ${err.message}`);
        },
      }
    );
  }, [transcripts, transcribeMutation]);

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="p-3 sm:p-6 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Search Reels
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search Instagram reels by keyword, creator handle, or paste reel URLs directly. Discover trending content and analyze viral patterns.
        </p>
      </div>

      {/* Search Bar */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          {/* Search Type Toggle */}
          <div className="flex rounded-lg border border-border/50 overflow-hidden mb-4 w-fit text-xs sm:text-sm">
            <button
              onClick={() => setSearchType("keyword")}
              className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
                searchType === "keyword"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Hash className="h-3.5 w-3.5" />
              Keyword
            </button>
            <button
              onClick={() => setSearchType("handle")}
              className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors border-l border-border/50 ${
                searchType === "handle"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <AtSign className="h-3.5 w-3.5" />
              Handle
            </button>
            <button
              onClick={() => setSearchType("url")}
              className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors border-l border-border/50 ${
                searchType === "url"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              URL
            </button>
          </div>

          {/* Keyword Search */}
          {searchType === "keyword" && (
            <>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                    placeholder="Search by topic, keyword, or hashtag..."
                    className="pl-10"
                  />
                </div>
                <Button onClick={doSearch} disabled={isSearching || !query.trim()} className="px-6">
                  {isSearching ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching...</> : <><Search className="h-4 w-4 mr-2" /> Search</>}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                AI discovers relevant creators for your topic and fetches their latest reels. Try topics like "marketing", "fitness", or "cooking".
              </p>
            </>
          )}

          {/* Handle Search */}
          {searchType === "handle" && (
            <>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                    placeholder="Enter Instagram handle (e.g. natgeo)"
                    className="pl-10"
                  />
                  {isLoadingProfile && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!isLoadingProfile && profileFound && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                  {!isLoadingProfile && profileError && (
                    <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                <Button
                  onClick={doSearch}
                  disabled={isSearching || !handleInput.trim() || (profileFound && profile?.found && profile.isPrivate)}
                  className="px-6"
                >
                  {isSearching ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching...</> : <><Search className="h-4 w-4 mr-2" /> Search</>}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Enter a public Instagram username to browse their reels. Prefix with @ is optional.
              </p>
            </>
          )}

          {/* URL Search */}
          {searchType === "url" && (
            <>
              <Textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={`Paste up to 20 Instagram reel URLs (one per line):\nhttps://www.instagram.com/reel/ABC123/\nhttps://www.instagram.com/reel/DEF456/`}
                className="min-h-[120px] text-sm"
                disabled={urlSearch.isPending}
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-[11px] text-muted-foreground">
                  Paste Instagram reel URLs separated by new lines. Supports /reel/, /reels/, and /p/ URLs. Max 20 URLs.
                </p>
                <Button onClick={doSearch} disabled={isSearching || !urlInput.trim()} className="px-6">
                  {urlSearch.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching...</> : <><Link2 className="h-4 w-4 mr-2" /> Fetch Reels</>}
                </Button>
              </div>

              {/* URL Fetch Progress Bar */}
              {urlSearch.isPending && urlTotalCount > 0 && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span className="text-xs font-medium text-foreground">
                        Fetching reel data from Instagram...
                      </span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {urlFetchedCount} of {urlTotalCount} URLs processed
                    </span>
                  </div>
                  <Progress value={urlProgress} className="h-2" />
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Fetching metadata for each reel (views, likes, comments, creator info). This may take a moment.
                  </p>
                </div>
              )}

              {/* Completion flash */}
              {!urlSearch.isPending && urlProgress === 100 && (
                <div className="mt-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-500">
                        All reels fetched successfully!
                      </span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {urlFetchedCount} of {urlTotalCount} URLs processed
                    </span>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Profile Preview Card (Handle search) */}
      {searchType === "handle" && profileFound && profile?.found && (
        <Card className="border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              {/* Profile Picture */}
              <div className="shrink-0">
                {profile.profilePicUrl ? (
                  <img
                    src={profile.profilePicUrl}
                    alt={profile.username}
                    className="w-16 h-16 rounded-full object-cover border-2 border-border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
                    <Badge variant="outline" className="text-[10px] h-4 border-orange-500/50 text-orange-400">
                      <Lock className="mr-0.5 h-2.5 w-2.5" />
                      Private
                    </Badge>
                  )}
                </div>

                {profile.fullName && (
                  <p className="text-xs text-muted-foreground mb-1">{profile.fullName}</p>
                )}

                {profile.category && (
                  <Badge variant="secondary" className="text-[10px] h-4 mb-1.5">
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
                    <p className="font-bold text-foreground">{formatNumber(profile.postCount)}</p>
                    <p className="text-muted-foreground text-[10px]">posts</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-foreground">{formatNumber(profile.followerCount)}</p>
                    <p className="text-muted-foreground text-[10px]">followers</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-foreground">{formatNumber(profile.followingCount)}</p>
                    <p className="text-muted-foreground text-[10px]">following</p>
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
                  This account is private. Only public accounts can be searched.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Account Intelligence Panel */}
      {searchType === "handle" && intelligence && results.length > 0 && (
        <Card className="border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
          <CardContent className="py-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <span>🧠</span>
              <span>Account Intelligence</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{formatNumber(intelligence.avgViews)}</p>
                <p className="text-[10px] text-muted-foreground">Avg Views / Reel</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{intelligence.engagementRate}%</p>
                <p className="text-[10px] text-muted-foreground">Engagement Rate</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{intelligence.reelsPerWeek}</p>
                <p className="text-[10px] text-muted-foreground">Reels / Week</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className={`text-lg font-bold ${intelligence.trendColor}`}>{intelligence.trend}</p>
                <p className="text-[10px] text-muted-foreground">View Trend</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{intelligence.bestDay}</p>
                <p className="text-[10px] text-muted-foreground">Best Day to Post</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{intelligence.bestHour}</p>
                <p className="text-[10px] text-muted-foreground">Best Time to Post</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{intelligence.bestFormat}</p>
                <p className="text-[10px] text-muted-foreground">Best Format</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{formatNumber(intelligence.avgLikes)}</p>
                <p className="text-[10px] text-muted-foreground">Avg Likes / Reel</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile Error */}
      {searchType === "handle" && profileError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 animate-in fade-in duration-200">
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <XCircle className="h-3 w-3 shrink-0" />
            {profileError}
          </p>
        </div>
      )}

      {/* URL Errors */}
      {urlErrors.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3">
            <p className="text-xs font-medium text-amber-400 mb-1">Some URLs could not be fetched:</p>
            <ul className="space-y-0.5">
              {urlErrors.map((err, i) => (
                <li key={i} className="text-[11px] text-amber-400/70">{err}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {hasSearched && !isSearching && results.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No reels found. Try a different search term.</p>
          </CardContent>
        </Card>
      )}

      {/* Usage limit banner */}
      {!searchGate.isLoading && !searchGate.allowed && (
        <UpgradePrompt
          action="searchCount"
          used={searchGate.used}
          limit={searchGate.limit}
          planRequired={searchGate.planRequired}
          variant="banner"
        />
      )}

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Sort Controls */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {results.length} reel{results.length !== 1 ? "s" : ""} found
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort by:</span>
              <Select
                value={sortField}
                onValueChange={(v) => { setSortField(v as SortField); setSortDir("desc"); }}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewCount">Views</SelectItem>
                  <SelectItem value="likeCount">Likes</SelectItem>
                  <SelectItem value="commentCount">Comments</SelectItem>
                  <SelectItem value="engagementRate">Engagement Rate</SelectItem>
                  <SelectItem value="postedAt">Date Posted</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              >
                {sortDir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Results Table */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground w-[300px]">Reel</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Creator</th>
                    <th className="py-2.5 px-3 font-medium text-muted-foreground text-right cursor-pointer select-none" onClick={() => toggleSort("viewCount")}>
                      <span className="inline-flex items-center gap-1">Views <SortIcon field="viewCount" /></span>
                    </th>
                    <th className="py-2.5 px-3 font-medium text-muted-foreground text-right cursor-pointer select-none" onClick={() => toggleSort("likeCount")}>
                      <span className="inline-flex items-center gap-1">Likes <SortIcon field="likeCount" /></span>
                    </th>
                    <th className="py-2.5 px-3 font-medium text-muted-foreground text-right cursor-pointer select-none" onClick={() => toggleSort("commentCount")}>
                      <span className="inline-flex items-center gap-1">Comments <SortIcon field="commentCount" /></span>
                    </th>
                    <th className="py-2.5 px-3 font-medium text-muted-foreground text-right cursor-pointer select-none" onClick={() => toggleSort("engagementRate")}>
                      <span className="inline-flex items-center gap-1">Eng. Rate <SortIcon field="engagementRate" /></span>
                    </th>
                    <th className="py-2.5 px-3 font-medium text-muted-foreground text-right cursor-pointer select-none" onClick={() => toggleSort("duration")}>
                      <span className="inline-flex items-center gap-1">Duration <SortIcon field="duration" /></span>
                    </th>
                    <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((reel, idx) => {
                    const isExpanded = expandedRow === reel.shortcode;
                    const hasTranscript = !!transcripts[reel.shortcode];
                    const isTranscribing = !!transcribing[reel.shortcode];

                    return (
                      <ReelRow
                        key={reel.shortcode}
                        reel={reel}
                        idx={idx}
                        userTimezone={userTimezone}
                        isExpanded={isExpanded}
                        hasTranscript={hasTranscript}
                        isTranscribing={isTranscribing}
                        transcript={transcripts[reel.shortcode]}
                        onToggleExpand={() => setExpandedRow((prev) => (prev === reel.shortcode ? null : reel.shortcode))}
                        onTranscribe={() => handleTranscribe(reel)}
                        recreateMutation={recreateMutation}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ReelRow - Each row in the results table
// ══════════════════════════════════════════════════════════════

function ReelRow({
  reel,
  idx,
  userTimezone,
  isExpanded,
  hasTranscript,
  isTranscribing,
  transcript,
  onToggleExpand,
  onTranscribe,
  recreateMutation,
}: {
  reel: SearchResult;
  idx: number;
  userTimezone: string;
  isExpanded: boolean;
  hasTranscript: boolean;
  isTranscribing: boolean;
  transcript?: { text: string; segments: Segment[] };
  onToggleExpand: () => void;
  onTranscribe: () => void;
  recreateMutation: any;
}) {
  const postedDate = new Date(reel.postedAt);
  const caption = reel.caption || "";
  const truncatedCaption = caption.length > 80 ? caption.slice(0, 80) + "..." : caption;

  return (
    <>
      <tr
        className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${
          isTranscribing
            ? "border-2 border-blue-500 animate-pulse"
            : hasTranscript
              ? "border-2 border-green-500"
              : ""
        } ${isExpanded ? "bg-muted/10" : ""}`}
      >
        {/* Reel info */}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted/30 shrink-0 group">
              {reel.thumbnailUrl ? (
                <img src={reel.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Play className="h-4 w-4 text-muted-foreground/50" />
                </div>
              )}
              <a
                href={reel.reelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <ExternalLink className="h-4 w-4 text-white" />
              </a>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={caption}>
                {truncatedCaption || "No caption"}
              </p>
              <p className="text-[10px] text-amber-400/70 mt-0.5">
                {formatPostedTime(postedDate, userTimezone)}
              </p>
            </div>
          </div>
        </td>

        {/* Creator */}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <div className="text-xs">
              <span className="text-foreground">@{reel.ownerUsername}</span>
              {reel.ownerFollowerCount > 0 && (
                <span className="text-muted-foreground/60 ml-1">({formatNumber(reel.ownerFollowerCount)})</span>
              )}
            </div>
          </div>
        </td>

        {/* Views */}
        <td className="py-2.5 px-3 text-right">
          <span className="text-xs font-medium">{formatNumber(reel.viewCount)}</span>
        </td>

        {/* Likes */}
        <td className="py-2.5 px-3 text-right">
          <span className="text-xs">{formatNumber(reel.likeCount)}</span>
        </td>

        {/* Comments */}
        <td className="py-2.5 px-3 text-right">
          <span className="text-xs">{formatNumber(reel.commentCount)}</span>
        </td>

        {/* Engagement Rate */}
        <td className="py-2.5 px-3 text-right">
          <Badge
            variant="outline"
            className={`text-[10px] h-5 ${
              reel.engagementRate >= 5
                ? "border-emerald-500/30 text-emerald-400"
                : reel.engagementRate >= 2
                  ? "border-blue-500/30 text-blue-400"
                  : "border-border/50 text-muted-foreground"
            }`}
          >
            {reel.engagementRate.toFixed(2)}%
          </Badge>
        </td>

        {/* Duration */}
        <td className="py-2.5 px-3 text-right">
          <span className="text-xs text-muted-foreground">
            {reel.duration > 0 ? formatDurationShort(reel.duration) : "-"}
          </span>
        </td>

        {/* Actions */}
        <td className="py-2.5 px-3">
          <div className="flex flex-col items-center">
            {isTranscribing && (
              <div className="flex items-center gap-1 text-xs text-blue-400 font-medium mb-1 animate-pulse">
                <span>⏳</span>
                <span>Transcribing... 15-30 seconds</span>
              </div>
            )}
            {hasTranscript && !isTranscribing && (
              <div className="flex items-center gap-1 text-xs text-green-400 font-medium mb-1">
                <span>✅</span>
                <span>Transcript Ready</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 ${hasTranscript ? "text-emerald-400" : ""}`}
                  onClick={onTranscribe}
                  disabled={isTranscribing}
                >
                  {isTranscribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{hasTranscript ? "View Transcript" : "Transcribe"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={onToggleExpand}
                >
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isExpanded ? "Collapse" : "Expand Workflow"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={reel.reelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open on Instagram</TooltipContent>
            </Tooltip>
            </div>
          </div>
        </td>
      </tr>

      {/* Expanded Inline Workflow Panel */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="p-0" id={`transcript-${reel.shortcode}`}>
            <SearchInlineWorkflow
              reel={reel}
              hasTranscript={hasTranscript}
              isTranscribing={isTranscribing}
              transcript={transcript}
              onTranscribe={onTranscribe}
              userTimezone={userTimezone}
              recreateMutation={recreateMutation}
            />
          </td>
        </tr>
      )}
    </>
  );
}

