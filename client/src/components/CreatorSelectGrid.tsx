import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ONBOARDING_NICHES_BY_SLUG } from "@/data/onboardingNiches";

export const MAX_CREATORS = 5;

export type CreatorOption = {
  id: number;
  handle: string;
  displayName: string;
  followerCount: number;
  avgEngagementRate: number;
  profilePicUrl: string;
  totalReelsEver: number;
  reelsAvailable: number;
};

function formatCount(n: number): string {
  if (n >= 1_000_000_000)
    return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function CreatorProfilePic({
  profilePicUrl,
  handle,
}: {
  profilePicUrl: string;
  handle: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = handle.slice(0, 2).toUpperCase();
  if (!profilePicUrl?.trim() || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
        {initials}
      </div>
    );
  }
  return (
    <img
      src={profilePicUrl}
      alt={`@${handle}`}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export interface CreatorSelectGridProps {
  /** `{ [nicheSlug]: Creator[] }` — identical shape to
   *  `featured.accountsByNicheSlugs`'s `groups`. */
  groupedCreators: Record<string, CreatorOption[]>;
  /** Slugs that correspond to keys we should render a section for.
   *  Lets Settings render only the niches the user has selected. */
  nicheSlugs: string[];
  /** Currently selected handles (controlled). */
  selectedCreatorHandles: string[];
  onToggle: (handle: string) => void;
  isLoading?: boolean;
}

/**
 * Shared creator selection grid. Same visual + interaction model as
 * the onboarding step-2 picker; Commit 8's Settings page reuses it
 * for "Your Interests → Creators".
 */
export function CreatorSelectGrid({
  groupedCreators,
  nicheSlugs,
  selectedCreatorHandles,
  onToggle,
  isLoading,
}: CreatorSelectGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading creators...
      </div>
    );
  }

  if (nicheSlugs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Pick at least one niche to see creators.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {nicheSlugs.map((slug) => {
        const niche = ONBOARDING_NICHES_BY_SLUG.get(slug);
        const creators = groupedCreators[slug] ?? [];
        return (
          <section key={slug} className="space-y-3">
            <div className="flex items-center gap-2">
              <span>{niche?.emoji ?? "•"}</span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {niche?.name ?? slug}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {creators.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No featured creators available in this niche yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {creators.map((creator) => {
                  const selected = selectedCreatorHandles.includes(creator.handle);
                  const atCap =
                    !selected && selectedCreatorHandles.length >= MAX_CREATORS;
                  return (
                    <button
                      key={`${slug}-${creator.id}`}
                      type="button"
                      onClick={() => (atCap ? null : onToggle(creator.handle))}
                      disabled={atCap}
                      className={`relative rounded-xl border p-4 text-left transition ${
                        atCap
                          ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground opacity-50"
                          : selected
                            ? "border-primary bg-primary/8"
                            : "border-border bg-card hover:border-primary/35 hover:bg-card/80"
                      }`}
                    >
                      {selected ? (
                        <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                          ✓
                        </span>
                      ) : null}

                      <div className="mb-3 flex items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-full border border-border bg-muted">
                          <CreatorProfilePic
                            profilePicUrl={creator.profilePicUrl}
                            handle={creator.handle}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold">
                            {creator.displayName || `@${creator.handle}`}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            @{creator.handle}
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 space-y-2 border-t border-border pt-3">
                        <div className="flex min-w-0 items-baseline justify-between gap-2">
                          <p className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Followers
                          </p>
                          <p className="min-w-0 truncate text-right font-mono text-xs tabular-nums">
                            {formatCount(creator.followerCount)}
                          </p>
                        </div>
                        <div className="flex min-w-0 items-baseline justify-between gap-2">
                          <p className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Avg ER
                          </p>
                          <p className="min-w-0 truncate text-right font-mono text-xs tabular-nums text-emerald-400">
                            {creator.avgEngagementRate.toFixed(2)}%
                          </p>
                        </div>
                        <div className="flex min-w-0 items-baseline justify-between gap-2">
                          <p className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Reels
                          </p>
                          <p className="min-w-0 truncate text-right font-mono text-xs tabular-nums">
                            {creator.reelsAvailable}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
