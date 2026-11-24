/**
 * TikTok and YouTube on Creator Research → Explore creators (Figma page 18,
 * "Explore creators · TikTok" + "TikTok creator's videos", approved
 * 2026-11-24). Creators come from videos already in the library: opening one
 * is free and shows their stored videos; "Get all their videos" starts a
 * normal research (uses 1 research).
 */
import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import type { ViralPost } from "@shared/viralPosts";
import { researchReturnTo } from "@shared/researchIntent";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import { buildRemakeIntentMedia } from "@/lib/remakeIntent";
import { ViralPostPlayer } from "@/components/ViralPostPlayer";
import { HomeVideoCard } from "@/components/home-v2/HomeParts";
import { ResultCardSkeleton, resultCardGridClass } from "@/design-system/ResultCard";
import { PlatformFullColorMark } from "@/design-system/platformMarks";

export type ExplorePlatform = "instagram" | "tiktok" | "youtube";

export type LibraryCreator = {
  key: string;
  platform: "tiktok" | "youtube";
  handle: string;
  displayName: string | null;
  profilePicUrl: string | null;
  followerCount: number;
  videoCount: number;
};

export const PLATFORM_NAMES: Record<ExplorePlatform, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

/**
 * Which platform logos to show: only platforms that have creators (Instagram
 * also while its list is loading). Pure; exported for tests.
 */
export function visibleExplorePlatforms(args: {
  instagram: { count: number; loading: boolean };
  tiktok: number;
  youtube: number;
}): ExplorePlatform[] {
  const out: ExplorePlatform[] = [];
  if (args.instagram.count > 0 || args.instagram.loading) out.push("instagram");
  if (args.tiktok > 0) out.push("tiktok");
  if (args.youtube > 0) out.push("youtube");
  return out;
}

/** The chosen platform if it is shown, else the first shown one. Pure. */
export function effectiveExplorePlatform(chosen: ExplorePlatform, visible: ExplorePlatform[]): ExplorePlatform {
  return visible.includes(chosen) ? chosen : visible[0] ?? "instagram";
}

/** Instagram / TikTok / YouTube logo buttons (logos only, Figma "Platform logos"). */
export function PlatformLogoTabs({
  platforms,
  value,
  onChange,
}: {
  platforms: ExplorePlatform[];
  value: ExplorePlatform;
  onChange: (p: ExplorePlatform) => void;
}) {
  return (
    <div role="tablist" aria-label="Platform" className="flex gap-2">
      {platforms.map(p => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={value === p}
          aria-label={PLATFORM_NAMES[p]}
          onClick={() => onChange(p)}
          className={cn(
            "flex h-9 items-center justify-center rounded-[var(--sr-radius-8)] border px-3 transition-colors",
            value === p
              ? "border-[var(--sr-color-brand-primary)] bg-[var(--sr-color-brand-surface-subtle)]"
              : "border-[var(--sr-color-border-control)] bg-[var(--sr-color-surface-default)] hover:bg-[var(--sr-color-surface-hover)]"
          )}
          data-testid={`explore-platform-${p}`}
        >
          <PlatformFullColorMark platform={p} size={20} />
        </button>
      ))}
    </div>
  );
}

/** Remake + save for library videos: the same flow Home uses. */
function useLibraryVideoActions() {
  const utils = trpc.useUtils();
  const { startRemake, RemakeDialogs } = useLibraryRemakeChain();
  const libraryRoute = trpc.recreate.libraryRoute.useQuery(undefined, { staleTime: 5 * 60_000 });
  const addByUrl = trpc.collected.addByUrl.useMutation();
  const save = trpc.viralPosts.save.useMutation();
  const unsave = trpc.viralPosts.unsave.useMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedOverride, setSavedOverride] = useState<Record<string, boolean>>({});

  const remake = async (post: ViralPost) => {
    if (busyId) return;
    const url = (post.sourceUrl || "").trim();
    if (!url) {
      toast.error("This video has no link to remake.");
      return;
    }
    setBusyId(post.id);
    const libraryId = libraryRoute.data?.enabled && /^\d+$/.test(post.id) ? Number(post.id) : null;
    const toastId = libraryId == null ? toast.loading("Adding to Saved, then starting remake…") : undefined;
    try {
      await ingestUrlAndStartLibraryRemake(url, {
        resolveLibraryCandidateId: async () => libraryId,
        addByUrl: u => addByUrl.mutateAsync({ url: u }),
        fetchCollectedList: () => utils.collected.list.fetch(),
        startRemake,
        media: buildRemakeIntentMedia({
          thumbnailUrl: post.thumbnailUrl,
          videoUrl: post.videoUrl,
          reelId: post.reelId,
          platform: post.platform,
          sourceUrl: post.sourceUrl,
        }),
      });
      if (toastId != null) toast.dismiss(toastId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remake failed. Try again.", toastId != null ? { id: toastId } : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const toggleSave = async (post: ViralPost) => {
    const current = savedOverride[post.id] ?? post.saved;
    setSavedOverride(s => ({ ...s, [post.id]: !current }));
    try {
      if (!current) await save.mutateAsync({ postId: post.id });
      else await unsave.mutateAsync({ postId: post.id });
    } catch {
      setSavedOverride(s => ({ ...s, [post.id]: current }));
      toast.error("Couldn't update saved videos. Try again.");
    }
  };

  return { remake, toggleSave, busyId, isSaved: (p: ViralPost) => savedOverride[p.id] ?? p.saved, RemakeDialogs };
}

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K` : String(n);

/** "310K followers · 6 top videos from our library". Pure; exported for tests. */
export function libraryCreatorStats(c: Pick<LibraryCreator, "platform" | "followerCount" | "videoCount">): string {
  const parts: string[] = [];
  if (c.followerCount > 0) parts.push(`${compact(c.followerCount)} ${c.platform === "youtube" ? "subscribers" : "followers"}`);
  parts.push(`${c.videoCount} top video${c.videoCount === 1 ? "" : "s"} from our library`);
  return parts.join(" · ");
}

/** A library creator's stored videos (Figma "TikTok creator's videos"). */
export function LibraryCreatorVideos({
  creator,
  onBack,
  avatar,
}: {
  creator: LibraryCreator;
  onBack: () => void;
  avatar: React.ReactNode;
}) {
  const [, navigate] = useLocation();
  const [playing, setPlaying] = useState<ViralPost | null>(null);
  const closePlayer = useCallback(() => setPlaying(null), []);
  const actions = useLibraryVideoActions();
  const videos = trpc.viralPosts.exploreCreatorVideos.useQuery(
    { platform: creator.platform, handle: creator.handle },
    { staleTime: 5 * 60_000 }
  );
  const name = creator.displayName?.trim() || `@${creator.handle}`;
  const getAll = () => {
    try {
      navigate(researchReturnTo(creator.handle, creator.platform));
    } catch {
      toast.error("Couldn't open this creator. Try researching their username above.");
    }
  };
  const items = videos.data?.items ?? [];

  return (
    <div className="space-y-4" data-testid="explore-library-creator">
      {actions.RemakeDialogs}
      <button type="button" onClick={onBack} className="text-sm font-medium text-[var(--sr-color-text-brand)]">
        ← All {PLATFORM_NAMES[creator.platform]} creators
      </button>
      <div className="flex flex-col gap-3 rounded-[var(--sr-radius-12)] border border-[var(--sr-color-border-subtle)] bg-[var(--sr-color-surface-default)] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-[var(--sr-color-text-primary)]">{name}</span>
              <PlatformFullColorMark platform={creator.platform} size={16} />
            </div>
            <p className="truncate text-xs text-[var(--sr-color-text-secondary)]">@{creator.handle}</p>
            <p className="truncate text-xs text-[var(--sr-color-text-tertiary)]">{libraryCreatorStats(creator)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={getAll}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--sr-color-text-brand)]"
          data-testid="explore-get-all"
        >
          Get all their videos <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="text-xs text-[var(--sr-color-text-secondary)]">
        These videos are already in our library, so opening them is free. "Get all their videos" runs a full research (uses 1 research,
        about 1 to 3 minutes).
      </p>
      {videos.isLoading ? (
        <div className={resultCardGridClass}>
          {Array.from({ length: 3 }).map((_, i) => (
            <ResultCardSkeleton key={i} mediaFormat="portrait" />
          ))}
        </div>
      ) : videos.isError || items.length === 0 ? (
        <div className="rounded-[var(--sr-radius-12)] border border-[var(--sr-color-border-subtle)] bg-[var(--sr-color-surface-default)] px-6 py-10 text-center">
          <p className="text-base font-semibold text-[var(--sr-color-text-primary)]">
            {videos.isError ? "Couldn't load their videos" : "No stored videos right now"}
          </p>
          <p className="mt-1 text-sm text-[var(--sr-color-text-secondary)]">Tap "Get all their videos" to research this creator.</p>
        </div>
      ) : (
        <div className={resultCardGridClass}>
          {items.map(post => {
            const p = { ...post, saved: actions.isSaved(post) };
            return (
              <HomeVideoCard
                key={post.id}
                post={p}
                compact={false}
                busy={actions.busyId === post.id}
                onPlay={() => setPlaying(post)}
                onRemake={() => void actions.remake(post)}
                onToggleSave={() => void actions.toggleSave(p)}
              />
            );
          })}
        </div>
      )}
      {playing ? <ViralPostPlayer key={playing.id} post={playing} onClose={closePlayer} /> : null}
    </div>
  );
}
