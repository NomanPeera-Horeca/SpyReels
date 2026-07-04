import { formatDistanceToNow } from "date-fns";
import { FileText, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CoachScriptSummary = {
  id: number;
  title: string;
  hookPreview: string;
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

export function AiCoachHistoryPanel({
  scripts,
  activeScriptId,
  onSelect,
  onNewScript,
  loading,
  className,
}: AiCoachHistoryPanelProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-primary" />
          Recent scripts
        </div>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onNewScript}>
          New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Loading scripts...</p>
        ) : scripts.length === 0 ? (
          <p className="px-2 py-4 text-xs leading-relaxed text-muted-foreground">
            Your viral scripts will show up here after you generate one.
          </p>
        ) : (
          <ul className="space-y-1">
            {scripts.map((script) => {
              const isActive = script.id === activeScriptId;
              const when = formatDistanceToNow(new Date(script.updatedAt), { addSuffix: true });
              return (
                <li key={script.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(script.id)}
                    className={cn(
                      "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "bg-primary/10 ring-1 ring-primary/25"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{script.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {script.hookPreview}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{when}</p>
                      </div>
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
