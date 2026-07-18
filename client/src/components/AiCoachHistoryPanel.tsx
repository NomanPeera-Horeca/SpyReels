import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, FileText, History, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CoachScriptSummary = {
  id: number;
  title: string;
  hookPreview: string;
  bodyPreview?: string;
  planCardId: number | null;
  formatLabel: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type AiCoachHistoryPanelProps = {
  scripts: CoachScriptSummary[];
  activeScriptId: number | null;
  onSelect: (id: number) => void;
  onNewScript: () => void;
  loading?: boolean;
  className?: string;
};

function matchesQuery(script: CoachScriptSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    script.title,
    script.hookPreview,
    script.bodyPreview ?? "",
    script.formatLabel ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return text;

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "ig");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const isMatch = tokens.some((t) => part.toLowerCase() === t.toLowerCase());
    if (!isMatch) return <span key={i}>{part}</span>;
    return (
      <mark
        key={i}
        className="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/30"
      >
        {part}
      </mark>
    );
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function AiCoachHistoryPanel({
  scripts,
  activeScriptId,
  onSelect,
  onNewScript,
  loading,
  className,
}: AiCoachHistoryPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () => scripts.filter((script) => matchesQuery(script, deferredQuery)),
    [scripts, deferredQuery]
  );

  const hasQuery = query.trim().length > 0;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="space-y-2.5 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" />
            Recent scripts
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onNewScript}>
            New
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or script..."
            className="h-8 pl-8 pr-8 text-xs"
            aria-label="Search recent scripts"
          />
          {hasQuery ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {!loading && scripts.length > 0 ? (
          <p className="text-[10px] text-muted-foreground">
            {hasQuery
              ? `${filtered.length} of ${scripts.length} match${filtered.length === 1 ? "" : "es"}`
              : `${scripts.length} script${scripts.length === 1 ? "" : "s"}`}
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Loading scripts...</p>
        ) : scripts.length === 0 ? (
          <p className="px-2 py-4 text-xs leading-relaxed text-muted-foreground">
            Your viral scripts will show up here after you generate one.
          </p>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-xs font-medium text-foreground">No matching scripts</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Try another title or phrase from the hook.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 h-7 text-xs"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((script) => {
              const isActive = script.id === activeScriptId;
              const isExpanded = expandedId === script.id;
              const when = formatDistanceToNow(new Date(script.updatedAt), { addSuffix: true });
              const previewText = [script.hookPreview, script.bodyPreview?.trim()]
                .filter(Boolean)
                .join("\n\n");
              const needsExpand =
                script.title.length > 42 || previewText.trim().length > 90;

              return (
                <li key={script.id}>
                  <div
                    className={cn(
                      "rounded-xl px-3 py-2.5 transition-colors",
                      isActive
                        ? "bg-primary/10 ring-1 ring-primary/25"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(script.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              isExpanded ? "whitespace-normal break-words" : "truncate"
                            )}
                          >
                            {hasQuery ? highlightMatch(script.title, deferredQuery) : script.title}
                          </p>
                          <p
                            className={cn(
                              "mt-0.5 text-xs text-muted-foreground",
                              isExpanded
                                ? "whitespace-pre-wrap break-words"
                                : "line-clamp-2"
                            )}
                          >
                            {hasQuery
                              ? highlightMatch(previewText, deferredQuery)
                              : isExpanded
                                ? previewText
                                : script.hookPreview}
                          </p>
                        </div>
                      </div>
                    </button>
                    <div className="mt-1.5 flex items-center justify-between gap-2 pl-5">
                      <p className="text-[10px] text-muted-foreground">{when}</p>
                      {needsExpand ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setExpandedId((prev) => (prev === script.id ? null : script.id))
                          }
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "Show less" : "Expand"}
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform",
                              isExpanded && "rotate-180"
                            )}
                          />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
