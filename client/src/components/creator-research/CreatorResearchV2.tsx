/**
 * Combined Creator Research page (Figma "18 — Sidebar + Creator Research",
 * approved 2026-11-23), behind RESEARCH_V2_MODE. One page instead of two:
 *
 *   Creator Research
 *   [ research box: platform · @username or profile link · timeframe · Research ]
 *   My creators | Explore creators
 *   - My creators: everyone researched (formerly Creator Radar). The whole row
 *     opens their videos; Refresh / Remove live in the ··· menu.
 *   - Explore creators: ready-made creators in the user's niche (Instagram).
 *
 * The research box itself is built by the page (Home.tsx) so every existing
 * research behaviour (profile preview, limits, sign-in hand-off, TikTok and
 * YouTube flows) is unchanged.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useSearch } from "wouter";
import { ArrowRight, Loader2, MoreHorizontal, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { PlatformFullColorMark } from "@/design-system/platformMarks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMyCreators, type MyCreatorJob } from "@/lib/myCreators";
import { compactCount, creatorRowStatus, initialResearchTab, type ResearchTab } from "./creatorResearchModel";

export type ExploreCreator = {
  id: number;
  handle: string;
  displayName: string;
  followerCount: number;
  avgEngagementRate: number;
  profilePicUrl: string;
  reelsAvailable: number;
};

export type ExploreProps = {
  creators: ExploreCreator[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  niches: Array<{ slug: string; name: string }>;
  selectedNicheSlug: string;
  onSelectNiche: (slug: string) => void;
  onOpen: (creator: ExploreCreator) => void;
};

const card =
  "rounded-[var(--sr-radius-12)] border border-[var(--sr-color-border-subtle)] bg-[var(--sr-color-surface-default)]";

function Avatar({ src, label, size }: { src?: string | null; label: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const letter = (label.replace(/^@/, "").trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--sr-color-brand-surface-subtle)] text-sm font-medium text-[var(--sr-color-text-brand)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src && !failed ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        letter
      )}
    </span>
  );
}

function ResearchTabs({ tab, onChange, myCount }: { tab: ResearchTab; onChange: (t: ResearchTab) => void; myCount: number }) {
  const item = (id: ResearchTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => onChange(id)}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2 text-sm transition-colors",
        tab === id
          ? "border-[var(--sr-color-brand-primary)] font-medium text-[var(--sr-color-text-brand)]"
          : "border-transparent text-[var(--sr-color-text-secondary)] hover:text-[var(--sr-color-text-primary)]"
      )}
      data-testid={`research-tab-${id}`}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" className="flex gap-6 border-b border-[var(--sr-color-border-subtle)]">
      {item("my", myCount > 0 ? `My creators · ${myCount}` : "My creators")}
      {item("explore", "Explore creators")}
    </div>
  );
}

function CreatorRow({
  job,
  onOpen,
  canOpen,
  onRefresh,
  refreshing,
  onRemove,
}: {
  job: MyCreatorJob;
  onOpen: () => void;
  canOpen: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onRemove: () => void;
}) {
  const status = creatorRowStatus(job);
  return (
    <div
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? onOpen : undefined}
      onKeyDown={e => {
        if (canOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        card,
        "flex items-center gap-3 px-4 py-3 transition-colors",
        canOpen && "cursor-pointer hover:border-[var(--sr-color-brand-primary)]"
      )}
      data-testid="my-creator-row"
    >
      <Avatar src={job.profilePicUrl} label={job.handle} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-[var(--sr-color-text-primary)]">@{job.handle}</span>
          <PlatformFullColorMark platform={job.platform} size={16} />
        </div>
        <p
          className={cn(
            "mt-0.5 flex items-center gap-1.5 truncate text-xs",
            status.kind === "failed" ? "text-[var(--sr-color-status-error-foreground)]" : "text-[var(--sr-color-text-tertiary)]"
          )}
        >
          {status.kind === "researching" ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> : null}
          <span className="truncate">{status.text}</span>
        </p>
      </div>
      {canOpen ? (
        <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-[var(--sr-color-text-brand)] sm:flex">
          Open videos <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sr-radius-8)] text-[var(--sr-color-text-secondary)] hover:bg-[var(--sr-color-surface-hover)]"
            aria-label={`More options for @${job.handle}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64" onClick={e => e.stopPropagation()}>
          <DropdownMenuItem onSelect={onRefresh} disabled={refreshing || status.kind === "researching"}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            {job.status === "failed" ? "Try again" : "Refresh videos"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRemove} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Remove from My creators
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ExploreCard({ creator, onOpen }: { creator: ExploreCreator; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(card, "flex flex-col gap-3 p-5 text-left transition-colors hover:border-[var(--sr-color-brand-primary)]")}
      data-testid="explore-creator-card"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Avatar src={creator.profilePicUrl} label={creator.displayName || creator.handle} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-[var(--sr-color-text-primary)]">
            {creator.displayName || `@${creator.handle}`}
          </span>
          <span className="block truncate text-xs text-[var(--sr-color-text-secondary)]">
            @{creator.handle} · {compactCount(creator.followerCount)} followers
          </span>
        </span>
      </span>
      {creator.reelsAvailable > 0 ? (
        <span className="text-sm text-[var(--sr-color-text-primary)]">
          {creator.reelsAvailable} top videos ready to remake
        </span>
      ) : null}
      <span className="flex items-center gap-1 text-sm font-medium text-[var(--sr-color-text-brand)]">
        See their top videos <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </button>
  );
}

function EmptyBlock({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className={cn(card, "flex flex-col items-center px-6 py-10 text-center")}>
      <p className="text-base font-semibold text-[var(--sr-color-text-primary)]">{title}</p>
      <p className="mt-1 max-w-md text-sm text-[var(--sr-color-text-secondary)]">{body}</p>
      {children ? <div className="mt-4 flex justify-center">{children}</div> : null}
    </div>
  );
}

function ExploreGrid({ explore, limit }: { explore: ExploreProps; limit?: number }) {
  if (explore.loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading creators">
        {Array.from({ length: limit ?? 6 }).map((_, i) => (
          <div key={i} className={cn(card, "h-[132px] animate-pulse")} />
        ))}
      </div>
    );
  }
  if (explore.error) {
    return (
      <EmptyBlock title="Couldn't load creators" body="Check your connection and try again.">
        <Button variant="outline" size="sm" onClick={explore.onRetry}>
          Try again
        </Button>
      </EmptyBlock>
    );
  }
  const list = limit ? explore.creators.slice(0, limit) : explore.creators;
  if (list.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map(c => (
        <ExploreCard key={c.id} creator={c} onOpen={() => explore.onOpen(c)} />
      ))}
    </div>
  );
}

export function CreatorResearchV2({ researchBox, explore }: { researchBox: ReactNode; explore: ExploreProps }) {
  const { resolvedTheme } = useTheme();
  const search = useSearch();
  const mine = useMyCreators("updated");
  const requested = new URLSearchParams(search).get("tab");
  const [tab, setTab] = useState<ResearchTab | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<MyCreatorJob | null>(null);

  // Pick the starting tab once the list is known (a URL ?tab= wins).
  useEffect(() => {
    if (tab !== null) return;
    if (requested === "my" || requested === "explore") setTab(requested);
    else if (mine.loaded) setTab(initialResearchTab(null, mine.jobs.length > 0));
  }, [tab, requested, mine.loaded, mine.jobs.length]);
  const activeTab: ResearchTab = tab ?? initialResearchTab(requested, mine.jobs.length > 0);
  const firstVisit = mine.loaded && mine.jobs.length === 0;
  const selectedNicheName =
    explore.niches.find(n => n.slug === explore.selectedNicheSlug)?.name ?? (explore.selectedNicheSlug === "all" ? "All niches" : "");

  return (
    <div
      className={cn(resolvedTheme === "dark" ? "sr-scope-dark" : "sr-scope-light", "sr-mode-product", "mx-auto w-full max-w-[880px] px-2 pb-12 pt-4 sm:px-0 sm:pt-8")}
      style={{ background: "transparent" }}
      data-testid="creator-research-v2"
    >
      <header className="mb-6">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--sr-color-text-primary)]">Creator Research</h1>
        <p className="mt-1 text-sm text-[var(--sr-color-text-secondary)]">
          See any creator's best videos, then remake them in your style.
        </p>
      </header>

      <section className={cn(card, "mb-8 p-5")} aria-label="Research a creator">
        {researchBox}
      </section>

      <ResearchTabs tab={activeTab} onChange={setTab} myCount={mine.jobs.length} />

      <div className="mt-5" role="tabpanel">
        {activeTab === "my" ? (
          mine.loading ? (
            <div className="space-y-3" aria-label="Loading your creators">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={cn(card, "h-[70px] animate-pulse")} />
              ))}
            </div>
          ) : mine.jobs.length === 0 ? (
            <div className="space-y-4">
              <EmptyBlock title="No creators yet" body="Research anyone above, or tap one of these to start. It's free." />
              <ExploreGrid explore={explore} limit={3} />
            </div>
          ) : (
            <div className="space-y-3">
              {mine.jobs.map(job => (
                <CreatorRow
                  key={`${job.platform}-${job.id}`}
                  job={job}
                  canOpen={mine.canOpen(job)}
                  onOpen={() => mine.open(job, "research")}
                  onRefresh={() => mine.refresh(job)}
                  refreshing={mine.isRefreshing(job)}
                  onRemove={() => setConfirmRemove(job)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-5">
            {firstVisit ? (
              <div className="flex items-center gap-2 rounded-[var(--sr-radius-12)] bg-[var(--sr-color-brand-surface-subtle)] px-4 py-3 text-sm text-[var(--sr-color-text-primary)]">
                <Sparkles className="h-4 w-4 shrink-0 text-[var(--sr-color-text-brand)]" aria-hidden />
                New here? Tap any creator below to see their best videos. No typing, and it doesn't use your researches.
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-[var(--sr-color-text-primary)]">Popular in</h2>
              <Select value={explore.selectedNicheSlug} onValueChange={explore.onSelectNiche}>
                <SelectTrigger className="h-9 w-auto min-w-[12rem]" aria-label="Niche">
                  <SelectValue placeholder={selectedNicheName || "Pick a niche"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All niches</SelectItem>
                  {explore.niches.map(n => (
                    <SelectItem key={n.slug} value={n.slug}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!explore.loading && !explore.error && explore.creators.length === 0 ? (
              <EmptyBlock
                title="We're still finding creators in this niche"
                body="New niches fill up within a few hours. Meanwhile, research any creator above or pick another niche."
              />
            ) : (
              <ExploreGrid explore={explore} />
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmRemove !== null} onOpenChange={open => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove @{confirmRemove?.handle}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from My creators and deletes the videos stored for this research. You can research them again
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmRemove) mine.remove(confirmRemove);
                setConfirmRemove(null);
              }}
              disabled={mine.removing}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
