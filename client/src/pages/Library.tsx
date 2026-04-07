import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import {
  Search, BookOpen, FileText, Copy, ExternalLink, Filter,
  ChevronDown, Clock, User, Sparkles, Lightbulb, Globe,
  BookmarkCheck, RefreshCw, ArrowRight, Library as LibraryIcon,
} from "lucide-react";
import { ShareScript } from "@/components/ShareScript";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Tab = "transcripts" | "scripts";

export default function Library() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("transcripts");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [transcriptSource, setTranscriptSource] = useState<string | undefined>();
  const [scriptSource, setScriptSource] = useState<string | undefined>();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [previewType, setPreviewType] = useState<"transcript" | "script">("transcript");

  // Debounce search
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(() => setDebouncedSearch(val), 400);
    setSearchTimer(timer);
  };

  const transcriptsQuery = trpc.library.transcripts.useQuery(
    { search: debouncedSearch || undefined, source: transcriptSource as any, limit: 100, offset: 0 },
    { enabled: !!user && activeTab === "transcripts" }
  );

  const scriptsQuery = trpc.library.scripts.useQuery(
    { search: debouncedSearch || undefined, source: scriptSource as any, limit: 100, offset: 0 },
    { enabled: !!user && activeTab === "scripts" }
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  const truncate = (text: string, len: number) => {
    if (!text) return "";
    return text.length > len ? text.slice(0, len) + "..." : text;
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <LibraryIcon className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold">My Library</h2>
        <p className="text-muted-foreground text-center max-w-md">
          All your transcripts and generated scripts in one place. Sign in to access your library.
        </p>
        <Button asChild>
          <a href={`${getLoginUrl()}?returnTo=${encodeURIComponent("/library")}`}>
            Sign In to Continue
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LibraryIcon className="w-6 h-6 text-purple-500" />
          My Library
        </h1>
        <p className="text-muted-foreground mt-1">
          All your transcripts and generated scripts in one place
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => { setActiveTab("transcripts"); setSearch(""); setDebouncedSearch(""); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "transcripts"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Transcripts
          {transcriptsQuery.data && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {transcriptsQuery.data.total}
            </Badge>
          )}
        </button>
        <button
          onClick={() => { setActiveTab("scripts"); setSearch(""); setDebouncedSearch(""); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "scripts"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-4 h-4" />
          Scripts
          {scriptsQuery.data && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {scriptsQuery.data.total}
            </Badge>
          )}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === "transcripts" ? "Search transcripts by keyword, caption, or handle..." : "Search scripts by title, content, or handle..."}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {activeTab === "transcripts" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                {transcriptSource ? (transcriptSource === "scraped" ? "Scraped" : "Collected") : "All Sources"}
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTranscriptSource(undefined)}>
                <Globe className="w-4 h-4 mr-2" /> All Sources
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTranscriptSource("scraped")}>
                <RefreshCw className="w-4 h-4 mr-2" /> Scraped
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTranscriptSource("collected")}>
                <BookmarkCheck className="w-4 h-4 mr-2" /> Collected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {activeTab === "scripts" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                {scriptSource
                  ? scriptSource === "saved" ? "My Scripts" : scriptSource === "recreated" ? "Re-Created" : "From Ideas"
                  : "All Sources"}
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setScriptSource(undefined)}>
                <Globe className="w-4 h-4 mr-2" /> All Sources
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setScriptSource("saved")}>
                <FileText className="w-4 h-4 mr-2" /> My Scripts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setScriptSource("recreated")}>
                <Sparkles className="w-4 h-4 mr-2" /> Re-Created
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setScriptSource("idea")}>
                <Lightbulb className="w-4 h-4 mr-2" /> From Ideas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content */}
      {activeTab === "transcripts" && (
        <TranscriptsView
          data={transcriptsQuery.data}
          isLoading={transcriptsQuery.isLoading}
          onCopy={copyToClipboard}
          onPreview={(item) => { setPreviewItem(item); setPreviewType("transcript"); }}
          formatDate={formatDate}
          truncate={truncate}
        />
      )}

      {activeTab === "scripts" && (
        <ScriptsView
          data={scriptsQuery.data}
          isLoading={scriptsQuery.isLoading}
          onCopy={copyToClipboard}
          onPreview={(item) => { setPreviewItem(item); setPreviewType("script"); }}
          formatDate={formatDate}
          truncate={truncate}
        />
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewType === "transcript" ? (
                <>
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  Transcript
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5 text-purple-500" />
                  {previewItem?.title || "Script"}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              {/* Meta info */}
              <div className="flex flex-wrap gap-2">
                {previewItem.sourceHandle && (
                  <Badge variant="outline" className="gap-1">
                    <User className="w-3 h-3" /> @{previewItem.sourceHandle}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" /> {formatDate(previewItem.createdAt)}
                </Badge>
                <Badge variant="secondary">
                  {previewItem.source}
                </Badge>
              </div>

              {/* Caption (transcripts) */}
              {previewType === "transcript" && previewItem.caption && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Caption</p>
                  <p className="text-sm">{previewItem.caption}</p>
                </div>
              )}

              {/* Content */}
              <div className="p-4 bg-muted/30 rounded-lg border">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                  {previewType === "transcript" ? previewItem.transcript : previewItem.content}
                </pre>
              </div>

              {/* Hook Analysis (transcripts) */}
              {previewType === "transcript" && previewItem.hookAnalysis && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-1 font-medium">Hook Analysis</p>
                  <p className="text-sm">{previewItem.hookAnalysis}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    copyToClipboard(previewType === "transcript" ? previewItem.transcript : previewItem.content);
                  }}
                  className="gap-2"
                >
                  <Copy className="w-4 h-4" /> Copy Full Text
                </Button>
                {previewItem.reelUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(previewItem.reelUrl, "_blank")}
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" /> View Reel
                  </Button>
                )}
                {previewType === "script" && previewItem.source === "saved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.location.href = `/scripts/${previewItem.id}`;
                    }}
                    className="gap-2"
                  >
                    <ArrowRight className="w-4 h-4" /> Open in Editor
                  </Button>
                )}
                <ShareScript
                  title={previewItem.title || previewItem.handle || "Script"}
                  content={previewType === "transcript" ? previewItem.transcript : previewItem.content}
                  variant="button"
                  size="sm"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Transcripts View ──
function TranscriptsView({ data, isLoading, onCopy, onPreview, formatDate, truncate }: {
  data: any; isLoading: boolean; onCopy: (t: string) => void;
  onPreview: (item: any) => void; formatDate: (d: any) => string; truncate: (t: string, l: number) => string;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
          <BookOpen className="w-7 h-7 text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No transcripts yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Transcripts appear here when you scrape reels or collect them via the Chrome extension. Start by scraping an Instagram account.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.href = "/dashboard"}>
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{data.total} transcript{data.total !== 1 ? "s" : ""} found</p>
      <div className="grid gap-2">
        {data.items.map((item: any) => (
          <Card
            key={`${item.source}-${item.id}`}
            className="cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => onPreview(item)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                {/* Thumbnail */}
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.sourceHandle && (
                      <span className="text-sm font-medium">@{item.sourceHandle}</span>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {item.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {truncate(item.transcript || item.caption || "No transcript available", 200)}
                  </p>
                </div>

                {/* Quick actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onCopy(item.transcript || ""); }}
                    title="Copy transcript"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {item.reelUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); window.open(item.reelUrl, "_blank"); }}
                      title="View reel"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Scripts View ──
function ScriptsView({ data, isLoading, onCopy, onPreview, formatDate, truncate }: {
  data: any; isLoading: boolean; onCopy: (t: string) => void;
  onPreview: (item: any) => void; formatDate: (d: any) => string; truncate: (t: string, l: number) => string;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
          <FileText className="w-7 h-7 text-purple-500" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No scripts yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Scripts appear here when you re-create scripts from reels, save scripts, or generate them from ideas.
        </p>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => window.location.href = "/scripts"}>
            My Scripts
          </Button>
          <Button variant="outline" onClick={() => window.location.href = "/ideas"}>
            Idea to Script
          </Button>
        </div>
      </div>
    );
  }

  const sourceIcon = (source: string) => {
    switch (source) {
      case "saved": return <FileText className="w-3.5 h-3.5" />;
      case "recreated": return <Sparkles className="w-3.5 h-3.5" />;
      case "idea": return <Lightbulb className="w-3.5 h-3.5" />;
      default: return <FileText className="w-3.5 h-3.5" />;
    }
  };

  const sourceLabel = (source: string) => {
    switch (source) {
      case "saved": return "My Scripts";
      case "recreated": return "Re-Created";
      case "idea": return "From Idea";
      default: return source;
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{data.total} script{data.total !== 1 ? "s" : ""} found</p>
      <div className="grid gap-2">
        {data.items.map((item: any) => (
          <Card
            key={`${item.source}-${item.id}`}
            className="cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => onPreview(item)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  {sourceIcon(item.source)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs gap-1">
                      {sourceIcon(item.source)} {sourceLabel(item.source)}
                    </Badge>
                    {item.sourceHandle && (
                      <Badge variant="outline" className="text-xs">
                        @{item.sourceHandle}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                    <span className="text-xs text-muted-foreground">{item.wordCount} words</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {truncate(item.content || "No content", 200)}
                  </p>
                </div>

                {/* Quick actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onCopy(item.content || ""); }}
                    title="Copy script"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {item.source === "saved" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); window.location.href = `/scripts/${item.id}`; }}
                      title="Open in editor"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
