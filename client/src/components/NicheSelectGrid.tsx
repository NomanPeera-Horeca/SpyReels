import { useState } from "react";
import { Search } from "lucide-react";
import { ONBOARDING_NICHES } from "@/data/onboardingNiches";

export const MAX_NICHES = 5;

export interface NicheSelectGridProps {
  /** Currently selected slugs (controlled). */
  selectedNicheSlugs: string[];
  /** Toggle a single slug on/off. Parent owns the cap logic for
   *  consistency, but the grid also respects MAX_NICHES and will
   *  disable unselected tiles at the cap as a UX safety net. */
  onToggle: (slug: string) => void;
  /** Optional heading / copy. Pass `null` to hide. */
  heading?: React.ReactNode;
  /** Hide the counter chip (Settings uses its own compact label). */
  hideCounter?: boolean;
}

/**
 * Shared niche selection grid. Ported from `pages/onboarding.tsx` so
 * Settings ("Your Interests" — Commit 8) can reuse the exact visual
 * language without cloning the markup. Keeping it controlled (parent
 * owns state) means onboarding can drive it with its multi-step state
 * machine and Settings can drive it with a simple local diff.
 */
export function NicheSelectGrid({
  selectedNicheSlugs,
  onToggle,
  heading,
  hideCounter,
}: NicheSelectGridProps) {
  const [search, setSearch] = useState("");

  const filtered = ONBOARDING_NICHES.filter((niche) =>
    niche.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div>
      {heading !== null && heading !== undefined && (
        <div className="mb-4">{heading}</div>
      )}

      {!hideCounter && (
        <div
          className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
            selectedNicheSlugs.length > 0
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-mono text-xs ${
                selectedNicheSlugs.length > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {selectedNicheSlugs.length}
            </span>
            <span className="text-sm">
              {`${selectedNicheSlugs.length} of ${MAX_NICHES} niches selected`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="text-primary">Tip:</span> Pick up to 5 niches
          </p>
        </div>
      )}

      <div className="relative mb-4 max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search niches..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground outline-none transition focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No niches match &quot;{search}&quot;. Try a different search.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {filtered.map((niche) => {
            const selected = selectedNicheSlugs.includes(niche.slug);
            const atCap = !selected && selectedNicheSlugs.length >= MAX_NICHES;
            return (
              <button
                key={niche.slug}
                type="button"
                onClick={() => (atCap ? null : onToggle(niche.slug))}
                disabled={atCap}
                className={`relative min-h-24 rounded-xl border p-4 text-center transition ${
                  atCap
                    ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground opacity-50"
                    : selected
                      ? "border-primary bg-primary/8"
                      : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
                }`}
              >
                {selected ? (
                  <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    ✓
                  </span>
                ) : null}
                <div className="mb-2 text-2xl">{niche.emoji}</div>
                <div
                  className={`text-xs leading-snug ${
                    selected ? "text-primary" : "text-foreground"
                  }`}
                >
                  {niche.name}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
