import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type {
  ExploreAdvancedFilters,
  ExploreQuickFilter,
} from "@/lib/viralPosts/types";
import { DEFAULT_EXPLORE_FILTERS, normalizeExploreFilters } from "@/lib/viralPosts/types";

type ViralPostFiltersProps = {
  quickFilter: ExploreQuickFilter;
  onQuickFilterChange: (value: ExploreQuickFilter) => void;
  filters: ExploreAdvancedFilters;
  onFiltersChange: (value: ExploreAdvancedFilters) => void;
  onApply: (filters: ExploreAdvancedFilters) => void;
  onReset: () => void;
};

export function ViralPostFilters({
  quickFilter,
  onQuickFilterChange,
  filters,
  onFiltersChange,
  onApply,
  onReset,
}: ViralPostFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<ExploreAdvancedFilters>(filters);

  const openDrawer = () => {
    setDraft(normalizeExploreFilters(filters));
    setDrawerOpen(true);
  };

  const toggleQuick = (next: "rising" | "proven") => {
    onQuickFilterChange(quickFilter === next ? "all" : next);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn(
            "rounded-full border border-[var(--sr-color-border-default)] bg-[var(--sr-color-surface-default)] px-3 py-1.5 text-xs font-bold text-[var(--sr-color-text-secondary)] hover:text-[var(--sr-color-text-primary)]",
            quickFilter === "rising" &&
              "border-[var(--sr-color-brand-primary)] bg-[var(--sr-color-brand-surface-subtle)] text-[var(--sr-color-text-brand)]"
          )}
          onClick={() => toggleQuick("rising")}
        >
          Rising
        </button>
        <button
          type="button"
          className={cn(
            "rounded-full border border-[var(--sr-color-border-default)] bg-[var(--sr-color-surface-default)] px-3 py-1.5 text-xs font-bold text-[var(--sr-color-text-secondary)] hover:text-[var(--sr-color-text-primary)]",
            quickFilter === "proven" &&
              "border-[var(--sr-color-brand-primary)] bg-[var(--sr-color-brand-surface-subtle)] text-[var(--sr-color-text-brand)]"
          )}
          onClick={() => toggleQuick("proven")}
        >
          Proven
        </button>
        <button
          type="button"
          className="rounded-full border border-[var(--sr-color-border-default)] bg-[var(--sr-color-surface-default)] px-3 py-1.5 text-xs font-bold text-[var(--sr-color-text-secondary)] hover:text-[var(--sr-color-text-primary)]"
          onClick={openDrawer}
        >
          Filters
        </button>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full border-[var(--sr-color-border-default)] bg-[var(--sr-color-surface-default)] text-[var(--sr-color-text-primary)] sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle className="text-[var(--sr-color-text-primary)]">Explore filters</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6 overflow-y-auto px-1 pb-4">
            <FilterGroup title="Platforms">
              <CheckRow
                label="Instagram Reels"
                checked={draft.platforms.instagram}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    platforms: { ...d.platforms, instagram: checked, youtube: false },
                  }))
                }
              />
              <CheckRow
                label="TikTok"
                checked={draft.platforms.tiktok}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    platforms: { ...d.platforms, tiktok: checked, youtube: false },
                  }))
                }
              />
            </FilterGroup>

            <FilterGroup title="Posted date">
              {(
                [
                  ["24h", "Last 24 hours"],
                  ["7d", "Last 7 days"],
                  ["30d", "Last 30 days"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm text-[var(--sr-color-text-secondary)]"
                >
                  <span>{label}</span>
                  <input
                    type="radio"
                    name="viral-posted-within"
                    checked={draft.postedWithin === value}
                    onChange={() =>
                      setDraft((d) => ({ ...d, postedWithin: value }))
                    }
                    className="accent-[var(--sr-color-action-primary)]"
                  />
                </label>
              ))}
            </FilterGroup>
          </div>

          <SheetFooter className="mt-auto flex-row gap-2 border-t border-[var(--sr-color-border-default)] pt-4">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--sr-color-border-default)] bg-transparent text-[var(--sr-color-text-primary)]"
              onClick={() => {
                const next = normalizeExploreFilters(DEFAULT_EXPLORE_FILTERS);
                setDraft(next);
                onFiltersChange(next);
                onReset();
                setDrawerOpen(false);
              }}
            >
              Reset
            </Button>
            <Button
              type="button"
              className="bg-[var(--sr-color-action-primary)] text-white hover:bg-[var(--sr-color-action-primary-hover)]"
              onClick={() => {
                const next = normalizeExploreFilters(draft);
                onFiltersChange(next);
                onApply(next);
                setDrawerOpen(false);
              }}
            >
              Apply filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-bold text-[var(--sr-color-text-primary)]">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm text-[var(--sr-color-text-secondary)]",
        disabled && "cursor-not-allowed opacity-55"
      )}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--sr-color-action-primary)]"
      />
    </label>
  );
}
