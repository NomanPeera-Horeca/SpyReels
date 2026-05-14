import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Search, BookOpen, FileText, Copy, ExternalLink, Filter,
  ChevronDown, Sparkles, Lightbulb, Globe,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Tab = "transcripts" | "scripts";

/** Split on blank lines; preserve single newlines inside each block */
function ParagraphizePlainText({ text }: { text: string }) {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    return (
      <p className="text-sm text-muted-foreground italic">No content</p>
    );
  }
  let blocks = trimmed.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1 && trimmed.includes("\n")) {
    blocks = trimmed.split(/\n/).map((b) => b.trim()).filter(Boolean);
  }
  const paragraphs = blocks.length > 0 ? blocks : [trimmed];
  return (
    <div className="space-y-4">
      {paragraphs.map((block, i) => (
        <p
          key={i}
          className="text-[15px] sm:text-base leading-relaxed text-foreground/95 whitespace-pre-wrap break-words"
        >
          {block}
        </p>
      ))}
    </div>
  );
}

function previewScriptSourceLabel(source: string) {
  switch (source) {
    case "saved":
      return "My Scripts";
    case "recreated":
      return "Re-created";
    case "idea":
      return "From idea";
    default:
      return source;
  }
}

function HookAnalysisMarkdown({ markdown }: { markdown: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none rounded-xl border border-amber-500/25 bg-amber-500/[0.09] px-4 py-4",
        "dark:prose-invert",
        "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_strong]:font-semibold [&_strong]:text-amber-950 dark:[&_strong]:text-amber-50",
        "[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1",
        "[&_li]:marker:text-amber-700 dark:[&_li]:marker:text-amber-400",
        "[&_code]:rounded-md [&_code]:border [&_code]:border-amber-500/20 [&_code]:bg-background/80 [&_code]:px-1.5 [&_code]:py-px [&_code]:text-[0.85em]",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-4 [&_h2]:mb-2 first:[&_h2]:mt-0",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5"
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown.trim()}</ReactMarkdown>
    </div>
  );
}

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
    {
      search: activeTab === "transcripts" ? (debouncedSearch || undefined) : undefined,
      source: activeTab === "transcripts" ? (transcriptSource as "scraped" | "collected" | undefined) : undefined,
      limit: 100,
      offset: 0,
    },
    {
      enabled: !!user,
      staleTime: 60_000,
      placeholderData: (prev) => prev,
    }
  );

  const scriptsQuery = trpc.library.scripts.useQuery(
    {
      search: activeTab === "scripts" ? (debouncedSearch || undefined) : undefined,
      source: activeTab === "scripts" ? (scriptSource as "saved" | "recreated" | "idea" | undefined) : undefined,
      limit: 100,
      offset: 0,
    },
    {
      enabled: !!user,
      staleTime: 60_000,
      placeholderData: (prev) => prev,
    }
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
          Reel transcripts you&apos;ve run and scripts you&apos;ve saved, in one place.
          Sign in to see yours.
        </p>
        <Button asChild>
          <a href={getLoginUrl({ returnTo: "/library" })}>
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
          isLoading={transcriptsQuery.isLoading && !transcriptsQuery.data}
          isError={transcriptsQuery.isError}
          errorMessage={transcriptsQuery.error?.message}
          onRetry={() => transcriptsQuery.refetch()}
          onCopy={copyToClipboard}
          onPreview={(item) => { setPreviewItem(item); setPreviewType("transcript"); }}
          formatDate={formatDate}
        />
      )}

      {activeTab === "scripts" && (
        <ScriptsView
          data={scriptsQuery.data}
          isLoading={scriptsQuery.isLoading && !scriptsQuery.data}
          isError={scriptsQuery.isError}
          errorMessage={scriptsQuery.error?.message}
          onRetry={() => scriptsQuery.refetch()}
          onCopy={copyToClipboard}
          onPreview={(item) => { setPreviewItem(item); setPreviewType("script"); }}
          formatDate={formatDate}
        />
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(88vh,900px)] w-[min(56rem,calc(100vw-1.25rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-border/80 p-0 shadow-xl sm:rounded-xl"
        >
          {previewItem ? (
            <>
              <DialogHeader className="shrink-0 space-y-1.5 border-b border-border/60 px-5 py-4 pr-14 text-left sm:px-6">
                <DialogTitle className="flex flex-wrap items-center gap-2.5 text-left text-xl font-semibold leading-tight tracking-tight">
                  {previewType === "transcript" ? (
                    <>
                      <BookOpen className="h-5 w-5 shrink-0 text-blue-500" aria-hidden />
                      Transcript preview
                    </>
                  ) : (
                    <>
                      <FileText className="h-5 w-5 shrink-0 text-violet-500" aria-hidden />
                      <span className="break-words">
                        {previewItem.title || "Script preview"}
                      </span>
                    </>
                  )}
                </DialogTitle>
                <DialogDescription className="text-left text-sm leading-relaxed">
                  <span className="text-foreground">
                    {previewItem.sourceHandle ? `@${previewItem.sourceHandle}` : ""}
                    {previewItem.sourceHandle ? " · " : ""}
                  </span>
                  <span>{formatDate(previewItem.createdAt)}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {previewType === "transcript"
                      ? transcriptKindLabel(String(previewItem.source))
                      : previewScriptSourceLabel(String(previewItem.source))}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                <div className="space-y-6">
                  {previewType === "transcript" && previewItem.caption ? (
                    <section className="space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Instagram caption
                      </h3>
                      <div className="rounded-xl border border-border/60 bg-muted/35 px-4 py-3.5">
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                          {previewItem.caption}
                        </p>
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {previewType === "transcript" ? "Full transcript" : "Script body"}
                    </h3>
                    <div className="rounded-xl border border-border/70 bg-card px-4 py-4 shadow-sm">
                      {previewType === "transcript" ? (
                        <ParagraphizePlainText text={String(previewItem.transcript ?? "")} />
                      ) : (
                        <ParagraphizePlainText text={String(previewItem.content ?? "")} />
                      )}
                    </div>
                  </section>

                  {previewType === "transcript" && previewItem.hookAnalysis ? (
                    <section className="space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200/95">
                        Hook analysis
                      </h3>
                      <HookAnalysisMarkdown markdown={String(previewItem.hookAnalysis)} />
                    </section>
                  ) : null}
                </div>
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-start sm:gap-2 sm:px-6">
                <Button
                  size="sm"
                  onClick={() => {
                    copyToClipboard(
                      previewType === "transcript"
                        ? String(previewItem.transcript ?? "")
                        : String(previewItem.content ?? "")
                    );
                  }}
                  className="gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copy {previewType === "transcript" ? "transcript" : "script"}
                </Button>
                {previewItem.reelUrl ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-border/80"
                    onClick={() => window.open(previewItem.reelUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" /> View on Instagram
                  </Button>
                ) : null}
                {previewType === "script" && previewItem.source === "saved" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-border/80"
                    onClick={() => {
                      window.location.href = `/scripts/${previewItem.id}`;
                    }}
                  >
                    <ArrowRight className="h-4 w-4" /> Open in editor
                  </Button>
                ) : null}
                <ShareScript
                  title={previewItem.title || previewItem.handle || "Script"}
                  content={
                    previewType === "transcript"
                      ? String(previewItem.transcript ?? "")
                      : String(previewItem.content ?? "")
                  }
                  variant="button"
                  size="sm"
                />
              </DialogFooter>
            </>
          ) : null}
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

function TranscriptsView({ data, isLoading, isError, errorMessage, onRetry, onCopy, onPreview, formatDate }: {
  data: any;
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onCopy: (t: string) => void;
  onPreview: (item: any) => void;
  formatDate: (d: any) => string;
}) {
  if (isError && onRetry) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <p className="font-medium text-foreground">Couldn&apos;t load transcripts</p>
        {errorMessage ? (
          <p className="mt-2 text-sm text-muted-foreground break-words max-w-lg mx-auto">{errorMessage}</p>
        ) : null}
        <Button variant="outline" className="mt-4 border-border/80" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

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
          <span className="font-normal text-muted-foreground">Tap a row for full text</span>
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
function ScriptsView({ data, isLoading, isError, errorMessage, onRetry, onCopy, onPreview, formatDate }: {
  data: any;
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onCopy: (t: string) => void;
  onPreview: (item: any) => void;
  formatDate: (d: any) => string;
}) {
  if (isError && onRetry) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <p className="font-medium text-foreground">Couldn&apos;t load scripts</p>
        {errorMessage ? (
          <p className="mt-2 text-sm text-muted-foreground break-words max-w-lg mx-auto">{errorMessage}</p>
        ) : null}
        <Button variant="outline" className="mt-4 border-border/80" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

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
          Save from the reel workflow, use Re-create, or Idea to Script. Everything you keep
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
          <span className="font-normal text-muted-foreground">Tap a row to preview</span>
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
