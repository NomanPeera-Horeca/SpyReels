import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SavedPostsFilter } from "@/lib/viralPosts/types";

const OPTIONS: { id: SavedPostsFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unused", label: "Not remade" },
  { id: "remade", label: "Remade" },
];

type SavedPostFiltersProps = {
  value: SavedPostsFilter;
  onChange: (value: SavedPostsFilter) => void;
};

export function SavedPostFilters({ value, onChange }: SavedPostFiltersProps) {
  return (
    <div className="mb-[18px] inline-flex w-max gap-1.5 rounded-[11px] border border-[var(--sr-color-border-default)] bg-[var(--sr-color-surface-default)] p-1">
      {OPTIONS.map((opt) => (
        <Button
          key={opt.id}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-auto rounded-lg px-3 py-2 text-xs font-bold text-[var(--sr-color-text-secondary)] hover:bg-[var(--sr-color-surface-hover)] hover:text-[var(--sr-color-text-primary)]",
            value === opt.id && "bg-[var(--sr-color-surface-hover)] text-[var(--sr-color-text-primary)]"
          )}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
