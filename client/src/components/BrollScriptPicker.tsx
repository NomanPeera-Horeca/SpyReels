import { useMemo, useState } from "react";
import { Clapperboard, FileText, Loader2, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BrollScriptPick = {
  id: number;
  title: string;
  content: string;
  sourceHandle: string | null;
  wordCount: number | null;
};

type BrollScriptPickerProps = {
  selectedId?: number | null;
  onSelect: (script: BrollScriptPick) => void;
  className?: string;
  /** Compact height for dialogs / side panels. */
  maxListHeightClassName?: string;
};

function previewContent(content: string, max = 100): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).trimEnd()}…`;
}

export function BrollScriptPicker({
  selectedId = null,
  onSelect,
  className,
  maxListHeightClassName = "max-h-80",
}: BrollScriptPickerProps) {
  const [query, setQuery] = useState("");
  const listQuery = trpc.scripts.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const brollIdsQuery = trpc.scripts.listScriptIdsWithBroll.useQuery(undefined, {
    staleTime: 30_000,
  });

  const scripts = listQuery.data ?? [];
  const brollIdSet = useMemo(
    () => new Set(brollIdsQuery.data ?? []),
    [brollIdsQuery.data]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter((s) => {
      const title = (s.title || "").toLowerCase();
      const content = (s.content || "").toLowerCase();
      const handle = (s.sourceHandle || "").toLowerCase();
      return title.includes(q) || content.includes(q) || handle.includes(q);
    });
  }, [query, scripts]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search scripts by title or text..."
          className="h-9 pl-8 pr-8 text-sm"
          aria-label="Search scripts"
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

      {!listQuery.isLoading && scripts.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {hasQuery
            ? `${filtered.length} of ${scripts.length} match${filtered.length === 1 ? "" : "es"}`
            : `${scripts.length} script${scripts.length === 1 ? "" : "s"}`}
        </p>
      ) : null}

      <div className={cn("overflow-y-auto rounded-lg border", maxListHeightClassName)}>
        {listQuery.isLoading ? (
          <div className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scripts...
          </div>
        ) : scripts.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-5 w-5 opacity-60" />
            <p>No saved scripts yet.</p>
            <p className="mt-1 text-xs">Save a script from My Scripts, then pick it here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No matching scripts</p>
            <p className="mt-1 text-xs text-muted-foreground">Try another title or phrase.</p>
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
          <ul className="divide-y" role="listbox" aria-label="Scripts">
            {filtered.map((script) => {
              const isSelected = script.id === selectedId;
              const hasBroll = brollIdSet.has(script.id);
              return (
                <li key={script.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() =>
                      onSelect({
                        id: script.id,
                        title: script.title,
                        content: script.content,
                        sourceHandle: script.sourceHandle ?? null,
                        wordCount: script.wordCount ?? null,
                      })
                    }
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      isSelected && "bg-primary/10 hover:bg-primary/15"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-1 text-sm font-medium text-foreground">
                        {script.title || "Untitled script"}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {hasBroll ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                            title="Saved B-roll"
                          >
                            <Clapperboard className="h-3 w-3" aria-hidden />
                            B-roll
                          </span>
                        ) : null}
                        {isSelected ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Selected
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {previewContent(script.content || "")}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {script.wordCount != null ? <span>{script.wordCount} words</span> : null}
                      {script.sourceHandle ? <span>@{script.sourceHandle}</span> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
