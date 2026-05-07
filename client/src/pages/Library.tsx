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

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <LibraryIcon className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Transcripts &amp; scripts</h2>
        <p className="text-muted-foreground text-center max-w-md leading-relaxed">
          Reel transcripts you&apos;ve run and scripts you&apos;ve saved — in one place.
          Sign in to see yours.
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
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted border border-border/60">
            <LibraryIcon className="h-5 w-5 text-foreground" aria-hidden />
          </span>
          Transcripts &amp; scripts
        </h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          <span className="text-foreground/90 font-medium">Transcripts</span> are text extracted
          from reels you researched or collected.&nbsp;
          <span className="text-foreground/90 font-medium">Scripts</span> are drafts you saved,
          AI remakes, or outputs from Idea to Script.
        </p>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Library content type"
        className="flex w-full sm:w-auto sm:max-w-xl gap-1 rounded-xl border border-border/60 bg-muted/30 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "transcripts"}
          onClick={() => { setActiveTab("transcripts"); setSearch(""); setDebouncedSearch(""); }}
          className={`flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "transcripts"
              ? "bg-background text-foreground shadow-sm ring-2 ring-primary/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">Transcripts</span>
          {transcriptsQuery.data != null && (
            <Badge variant="secondary" className="ml-0.5 tabular-nums text-xs font-medium">
              {transcriptsQuery.data.total}
            </Badge>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "scripts"}
          onClick={() => { setActiveTab("scripts"); setSearch(""); setDebouncedSearch(""); }}
          className={`flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "scripts"
              ? "bg-background text-foreground shadow-sm ring-2 ring-primary/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">Scripts</span>
          {scriptsQuery.data != null && (
            <Badge variant="secondary" className="ml-0.5 tabular-nums text-xs font-medium">
              {scriptsQuery.data.total}
            </Badge>
          )}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={activeTab === "transcripts" ? "Search transcripts (text, caption, @handle)…" : "Search scripts (title, body, @handle)…"}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-11 border-border/70 bg-background/80"
          />
        </div>

        {activeTab === "transcripts" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 gap-2 shrink-0 border-border/70">
                <Filter className="w-4 h-4" />
                {transcriptSource ? (transcriptSource === "scraped" ? "From research" : "Collected") : "All Sources"}
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTranscriptSource(undefined)}>
                <Globe className="w-4 h-4 mr-2" /> All Sources
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTranscriptSource("scraped")}>
                <RefreshCw className="w-4 h-4 mr-2" /> From research
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
              <Button variant="outline" className="h-11 gap-2 shrink-0 border-border/70">
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
        />
      )}

      {activeTab === "scripts" && (
        <ScriptsView
          data={scriptsQuery.data}
          isLoading={scriptsQuery.isLoading}
          onCopy={copyToClipboard}
          onPreview={(item) => { setPreviewItem(item); setPreviewType("script"); }}
          formatDate={formatDate}
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
function transcriptKindLabel(source: string) {
  if (source === "scraped") return "From research";
  if (source === "collected") return "Collected";
  return source;
}

function TranscriptsView({ data, isLoading, onCopy, onPreview, formatDate }: {
  data: any; isLoading: boolean; onCopy: (t: string) => void;
  onPreview: (item: any) => void; formatDate: (d: any) => string;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 rounded-xl border border-border/50 bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 py-16 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/15 mb-4">
          <BookOpen className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold mb-1 text-foreground">No transcripts yet</h3>
        <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
          Run transcriptions from the dashboard on reels you spy, or add reels via Telegram.
          Saved transcripts show up here automatically.
        </p>
        <Button variant="default" className="mt-6 shadow-sm" onClick={() => window.location.href = "/dashboard"}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium text-foreground">
          {data.total} transcript{data.total !== 1 ? "s" : ""}{" "}
          <span className="font-normal text-muted-foreground">— tap a row for full text</span>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {data.items.map((item: any) => (
          <Card
            key={`${item.source}-${item.id}`}
            className="cursor-pointer rounded-xl border border-border/70 bg-card shadow-sm transition-all hover:border-border hover:shadow-md hover:bg-accent/5"
            onClick={() => onPreview(item)}
          >
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="w-[4.75rem] h-[4.75rem] md:w-24 md:h-24 rounded-xl object-cover shrink-0 ring-1 ring-border/50 bg-muted"
                  />
                ) : (
                  <div className="w-[4.75rem] h-[4.75rem] md:w-24 md:h-24 rounded-xl shrink-0 flex items-center justify-center bg-muted ring-1 ring-border/50">
                    <BookOpen className="w-8 h-8 text-muted-foreground/70" />
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {item.sourceHandle ? (
                      <span className="font-semibold text-foreground truncate max-w-[12rem] sm:max-w-none">
                        @{item.sourceHandle}
                      </span>
                    ) : null}
                    <Badge variant="secondary" className="text-[11px] font-medium capitalize">
                      {transcriptKindLabel(item.source)}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">
                    {item.transcript || item.caption || "No transcript yet"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-row sm:flex-col gap-2 pt-3 sm:pt-0 border-t border-border/60 sm:border-0 mt-2 sm:mt-0 justify-end sm:justify-start sm:items-stretch">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 border-border/80 text-foreground hover:bg-accent"
                    onClick={(e) => { e.stopPropagation(); onCopy(item.transcript || ""); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline text-xs">Copy</span>
                  </Button>
                  {item.reelUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 border-border/80 text-foreground hover:bg-accent"
                      onClick={(e) => { e.stopPropagation(); window.open(item.reelUrl, "_blank"); }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline text-xs">Reel</span>
                    </Button>
                  ) : null}
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
function ScriptsView({ data, isLoading, onCopy, onPreview, formatDate }: {
  data: any; isLoading: boolean; onCopy: (t: string) => void;
  onPreview: (item: any) => void; formatDate: (d: any) => string;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 rounded-xl border border-border/50 bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 py-16 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/15 mb-4">
          <FileText className="h-7 w-7 text-violet-600 dark:text-violet-400" />
        </div>
        <h3 className="text-lg font-semibold mb-1 text-foreground">No scripts yet</h3>
        <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
          Save from the reel workflow, use Re-create, or Idea to Script — everything you keep
          lands in the Scripts tab here.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-6">
          <Button variant="default" className="shadow-sm" onClick={() => window.location.href = "/scripts"}>
            My Scripts
          </Button>
          <Button variant="outline" className="border-border/70" onClick={() => window.location.href = "/ideas"}>
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
      case "recreated": return "Re-created";
      case "idea": return "From idea";
      default: return source;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium text-foreground">
          {data.total} script{data.total !== 1 ? "s" : ""}{" "}
          <span className="font-normal text-muted-foreground">— tap a row to preview</span>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {data.items.map((item: any) => (
          <Card
            key={`${item.source}-${item.id}`}
            className="cursor-pointer rounded-xl border border-border/70 bg-card shadow-sm transition-all hover:border-border hover:shadow-md hover:bg-accent/5"
            onClick={() => onPreview(item)}
          >
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex h-[4.75rem] w-[4.75rem] md:h-24 md:w-24 shrink-0 flex-col items-center justify-center rounded-xl bg-muted ring-1 ring-border/50 gap-1">
                  <span className="text-muted-foreground">{sourceIcon(item.source)}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-1 text-center leading-tight">
                    {sourceLabel(item.source)}
                  </span>
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2">
                    {item.title || "Untitled script"}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {item.sourceHandle ? (
                      <span className="font-medium text-foreground/85">@{item.sourceHandle}</span>
                    ) : null}
                    <span className="tabular-nums">{formatDate(item.createdAt)}</span>
                    {item.wordCount != null ? (
                      <span className="tabular-nums">{item.wordCount} words</span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
                    {item.content?.trim() ? item.content : "No preview text"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-row sm:flex-col gap-2 pt-3 sm:pt-0 border-t border-border/60 sm:border-0 mt-2 sm:mt-0 justify-end sm:justify-start sm:items-stretch">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 border-border/80 text-foreground hover:bg-accent"
                    onClick={(e) => { e.stopPropagation(); onCopy(item.content || ""); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline text-xs">Copy</span>
                  </Button>
                  {item.source === "saved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 border-border/80 text-foreground hover:bg-accent"
                      onClick={(e) => { e.stopPropagation(); window.location.href = `/scripts/${item.id}`; }}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline text-xs">Edit</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
