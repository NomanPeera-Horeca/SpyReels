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
import { DEFAULT_EXPLORE_FILTERS } from "@/lib/viralPosts/types";

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
    setDraft(filters);
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
            "rounded-full border border-[#2b2739] bg-[#111019] px-3 py-1.5 text-xs font-bold text-[#a9a4b8] hover:text-white",
            quickFilter === "rising" &&
              "border-[rgba(155,108,255,.48)] bg-[rgba(124,58,237,.15)] text-white"
          )}
          onClick={() => toggleQuick("rising")}
        >
          Rising
        </button>
        <button
          type="button"
          className={cn(
            "rounded-full border border-[#2b2739] bg-[#111019] px-3 py-1.5 text-xs font-bold text-[#a9a4b8] hover:text-white",
            quickFilter === "proven" &&
              "border-[rgba(155,108,255,.48)] bg-[rgba(124,58,237,.15)] text-white"
          )}
          onClick={() => toggleQuick("proven")}
        >
          Proven
        </button>
        <button
          type="button"
          className="rounded-full border border-[#2b2739] bg-[#111019] px-3 py-1.5 text-xs font-bold text-[#a9a4b8] hover:text-white"
          onClick={openDrawer}
        >
          Filters
        </button>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full border-[#2b2739] bg-[#111019] text-[#f6f4fb] sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle className="text-[#f6f4fb]">Explore filters</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6 overflow-y-auto px-1 pb-4">
            <FilterGroup title="Platforms">
              <CheckRow
                label="Instagram Reels"
                checked={draft.platforms.instagram}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    platforms: { ...d.platforms, instagram: checked },
                  }))
                }
              />
              <CheckRow
                label="TikTok"
                checked={draft.platforms.tiktok}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    platforms: { ...d.platforms, tiktok: checked },
                  }))
                }
              />
              <CheckRow
                label="YouTube Shorts"
                checked={draft.platforms.youtube}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    platforms: { ...d.platforms, youtube: checked },
                  }))
                }
              />
            </FilterGroup>

            <FilterGroup title="Momentum">
              <CheckRow
                label="Breaking out"
                checked={draft.momentum.breakingOut}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    momentum: { ...d.momentum, breakingOut: checked },
                  }))
                }
              />
              <CheckRow
                label="Rising fast"
                checked={draft.momentum.risingFast}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    momentum: { ...d.momentum, risingFast: checked },
                  }))
                }
              />
              <CheckRow
                label="Proven format"
                checked={draft.momentum.provenFormat}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    momentum: { ...d.momentum, provenFormat: checked },
                  }))
                }
              />
            </FilterGroup>

            <FilterGroup title="Video style">
              <CheckRow
                label="Talking head"
                checked={draft.videoStyles.talkingHead}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    videoStyles: { ...d.videoStyles, talkingHead: checked },
                  }))
                }
              />
              <CheckRow
                label="Storytelling"
                checked={draft.videoStyles.storytelling}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    videoStyles: { ...d.videoStyles, storytelling: checked },
                  }))
                }
              />
              <CheckRow
                label="Educational"
                checked={draft.videoStyles.educational}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    videoStyles: { ...d.videoStyles, educational: checked },
                  }))
                }
              />
              <CheckRow
                label="Faceless / B-roll"
                checked={draft.videoStyles.faceless}
                onChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    videoStyles: { ...d.videoStyles, faceless: checked },
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
                  className="flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm text-[#a9a4b8]"
                >
                  <span>{label}</span>
                  <input
                    type="radio"
                    name="viral-posted-within"
                    checked={draft.postedWithin === value}
                    onChange={() =>
                      setDraft((d) => ({ ...d, postedWithin: value }))
                    }
                    className="accent-[#7c3aed]"
                  />
                </label>
              ))}
            </FilterGroup>
          </div>

          <SheetFooter className="mt-auto flex-row gap-2 border-t border-[#2b2739] pt-4">
            <Button
              type="button"
              variant="outline"
              className="border-[#2b2739] bg-transparent text-[#f6f4fb]"
              onClick={() => {
                setDraft(DEFAULT_EXPLORE_FILTERS);
                onFiltersChange(DEFAULT_EXPLORE_FILTERS);
                onReset();
                setDrawerOpen(false);
              }}
            >
              Reset
            </Button>
            <Button
              type="button"
              className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              onClick={() => {
                onFiltersChange(draft);
                onApply(draft);
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
      <h4 className="mb-2 text-sm font-bold text-white">{title}</h4>
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
        "flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm text-[#a9a4b8]",
        disabled && "cursor-not-allowed opacity-55"
      )}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[#7c3aed]"
      />
    </label>
  );
}
