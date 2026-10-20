/**
 * Home v2 (Phase 5, behind the server Home switch). Figma Home v2 frames
 * A (personalization complete), B (incomplete: setup banner and general
 * picks), C (no plan yet), D (Your profiles) and the States sheet.
 *
 * Everything reuses existing features:
 * - Agent: the existing /studio Agent through its session prefill (same path
 *   as 30-Day Plan "Write script"), auto-submitted once on arrival.
 * - Ideas: plan.listCards (existing 30-Day Plan).
 * - Videos: homeV2.videos (indexed Viral Posts pools only; no scraping).
 * - Creators: homeV2.creators (stored featured catalog; no scraping).
 * - Remake (shared Result Card 288:666): the existing Collected Reels remake chain.
 * Rendering Home never starts paid scraping, a pool refresh or a model call.
 *
 * Mobile (Figma 1498:2199, 1498:2273, 1498:2327, 1498:2398) is this same page:
 * below 640px of content width the sections reorder by CSS and a few strings
 * switch to their approved mobile copy (HOME_COPY.mobile). The surrounding
 * shell (mobile browser header + menu, or the installed app's bottom tabs)
 * comes from the existing layouts, not from this page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";
import "@/design-system/tokens.css";
import type { SocialPlatform } from "@shared/personalization/model";
import {
  STUDIO_PREFILL_AUTORUN_KEY,
  STUDIO_PREFILL_META_KEY,
} from "@shared/studioCoachUi";
import { STUDIO_PREFILL_KEY } from "@shared/studioHeit";
import type { ViralPost } from "@shared/viralPosts";
import { PrimaryButton } from "@/design-system/core";
import { trpc } from "@/lib/trpc";
import { useExperienceAccess } from "@/lib/experienceAccess";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import { buildRemakeIntentMedia } from "@/lib/remakeIntent";
import { ViralPostPlayer } from "@/components/ViralPostPlayer";
import { HOME_COPY as C } from "./copy";
import {
  AgentComposer,
  COMPOSER_MIN_CHARS,
  CreatorRow,
  CreatorsSkeleton,
  HomeVideoCard,
  IdeaCard,
  IdeasSkeleton,
  ManageProfilesModal,
  ProfilesInvite,
  QuickActions,
  ResultSkeleton,
  SetupBanner,
  StateCard,
  VideoLinkEntry,
  type HomeIdea,
} from "./HomeParts";
import styles from "./home.module.css";

const BANNER_KEY = "sr_home_v2_setup_banner_dismissed";

/** Same breakpoint as the CSS container query in home.module.css. */
const COMPACT_MAX = 640;

/** True when Home's own content width is phone sized (matches the container query). */
function useCompact(ref: React.RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth <= COMPACT_MAX
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setCompact(entry.contentRect.width <= COMPACT_MAX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return compact;
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Private mode: the banner simply shows again next visit.
  }
}

export default function HomeV2Page() {
  const [, navigate] = useLocation();
  const posthog = usePostHog();
  const { access } = useExperienceAccess();
  const utils = trpc.useUtils();
  const frameRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(frameRef);

  const track = useCallback(
    (event: string, props?: Record<string, unknown>) => {
      if (access.internal) return;
      posthog?.capture(`home_v2_${event}`, props);
    },
    [access.internal, posthog]
  );

  const contextQ = trpc.homeV2.context.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const planQ = trpc.plan.listCards.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const creatorsQ = trpc.homeV2.creators.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const videosQ = trpc.homeV2.videos.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const [idea, setIdea] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    readFlag(BANNER_KEY)
  );
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [remakeBusyId, setRemakeBusyId] = useState<string | null>(null);
  const [savedOverride, setSavedOverride] = useState<Record<string, boolean>>(
    {}
  );
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const closePlayer = useCallback(() => setPlayingVideoId(null), []);

  const ctx = contextQ.data;
  const complete = ctx?.personalizationComplete ?? false;

  /* ---------- Agent ---------- */

  const openAgent = (prefill: string | null, autorun: boolean) => {
    try {
      if (prefill) {
        sessionStorage.setItem(STUDIO_PREFILL_KEY, prefill);
        if (autorun) sessionStorage.setItem(STUDIO_PREFILL_AUTORUN_KEY, "1");
      }
    } catch {
      return false;
    }
    navigate("/studio");
    return true;
  };

  const submitIdea = () => {
    const text = idea.trim();
    if (text.length < COMPOSER_MIN_CHARS) {
      setComposerError(C.composer.tooShort);
      return;
    }
    setComposerBusy(true);
    setComposerError(null);
    track("create_script", { length: text.length });
    if (!openAgent(text, true)) {
      setComposerBusy(false);
      setComposerError("Couldn't create your script. Your idea is still here.");
    }
  };

  const quick = (
    capability: "write_script" | "refine_script" | "hook_ideas"
  ) => {
    track("quick_action", { capability });
    navigate(`/studio?capability=${capability}`);
  };

  /* ---------- ideas ---------- */

  const ideas: HomeIdea[] = useMemo(() => {
    const cards = planQ.data?.calendarCards ?? [];
    return cards
      .filter(c => c.status !== "posted" && c.coachScriptId == null)
      .slice(0, 2)
      .map(c => ({ id: c.id, title: c.title, hook: c.hook || null }));
  }, [planQ.data]);
  const hasPlan = (planQ.data?.calendarCards.length ?? 0) > 0;

  const writeIdea = (id: number) => {
    const card = planQ.data?.calendarCards.find(c => c.id === id);
    if (!card) return;
    track("idea_write", { day: card.day });
    try {
      sessionStorage.setItem(
        STUDIO_PREFILL_KEY,
        `Day ${card.day} plan idea: ${card.title}\n\n${card.angle}\n\nHook idea: "${card.hook}"`
      );
      sessionStorage.setItem(
        STUDIO_PREFILL_META_KEY,
        JSON.stringify({
          planCardId: card.id,
          planCardTitle: card.title,
          planCardDay: card.day,
        })
      );
    } catch {
      // Storage blocked: the Agent opens empty; the user can still type.
    }
    navigate("/studio");
  };

  /* ---------- videos ---------- */

  const addByUrl = trpc.collected.addByUrl.useMutation();
  const save = trpc.viralPosts.save.useMutation();
  const unsave = trpc.viralPosts.unsave.useMutation();
  const { startRemake, RemakeDialogs } = useLibraryRemakeChain();

  const createFromVideo = async (post: ViralPost) => {
    if (remakeBusyId) return;
    const url = (post.sourceUrl || "").trim();
    if (!url) {
      toast.error("This post has no source URL to remake.");
      return;
    }
    setRemakeBusyId(post.id);
    track("video_create_script", { platform: post.platform });
    const toastId = toast.loading(
      "Adding to Collected Reels, then starting remake…"
    );
    try {
      await ingestUrlAndStartLibraryRemake(url, {
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
      toast.success("Remake started", { id: toastId });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Remake failed. Try again.",
        { id: toastId }
      );
    } finally {
      setRemakeBusyId(null);
    }
  };

  const toggleSave = async (post: ViralPost) => {
    const current = savedOverride[post.id] ?? post.saved;
    const next = !current;
    setSavedOverride(s => ({ ...s, [post.id]: next }));
    try {
      if (next) await save.mutateAsync({ postId: post.id });
      else await unsave.mutateAsync({ postId: post.id });
      track(next ? "video_saved" : "video_unsaved");
    } catch {
      setSavedOverride(s => ({ ...s, [post.id]: current }));
      toast.error("Couldn't update saved videos. Try again.");
    }
  };

  /* ---------- profiles ---------- */

  const profilesQ = trpc.homeV2.profiles.useQuery(undefined, {
    enabled: profilesOpen,
  });
  const switchProfile = trpc.homeV2.switchProfile.useMutation();

  const switchTo = async (profileId: string) => {
    try {
      await switchProfile.mutateAsync({ profileId });
      track("profile_switched");
      await Promise.all([
        utils.homeV2.invalidate(),
        utils.onboardingV2.getState.invalidate(),
      ]);
      setProfilesOpen(false);
    } catch {
      toast.error("Couldn't switch profiles. Try again.");
    }
  };

  const addProfile = (platform: SocialPlatform) => {
    track("profile_add", { platform });
    navigate(`/onboarding?add=${platform}`);
  };

  /* ---------- render ---------- */

  const nicheLabel = ctx?.nicheLabel ?? null;
  const showBanner = Boolean(ctx) && !complete && !bannerDismissed;
  const creators = creatorsQ.data;
  const videos = videosQ.data;
  const playingPost = useMemo(() => {
    if (!playingVideoId || !videos) return null;
    return videos.items.find(item => item.id === playingVideoId) ?? null;
  }, [playingVideoId, videos]);

  useEffect(() => {
    if (!playingVideoId || !videos) return;
    if (!videos.items.some(item => item.id === playingVideoId)) {
      setPlayingVideoId(null);
    }
  }, [playingVideoId, videos]);
  const videosSubtitle =
    videos?.personalized && nicheLabel
      ? `${nicheLabel} · ${C.videos.allPlatforms}`
      : C.videos.general;
  const creatorsSubtitle =
    creators?.personalized && nicheLabel
      ? C.creators.inNiche(nicheLabel)
      : C.creators.general;

  const ghostLink = compact ? [styles.ghost, styles.ghostBrand].join(" ") : styles.ghost;

  return (
    <div className={styles.frame} ref={frameRef}>
      <div
        className={["sr-scope-light", styles.page].join(" ")}
        data-testid="home-v2"
        data-compact={compact ? "true" : undefined}
      >
        <div className={styles.main}>
          {showBanner ? (
            <div className={styles.slotBanner}>
              <SetupBanner
                compact={compact}
                onFinish={() => {
                  track("finish_setup");
                  navigate("/onboarding");
                }}
                onDismiss={() => {
                  writeFlag(BANNER_KEY);
                  setBannerDismissed(true);
                }}
              />
            </div>
          ) : null}

          <section
            className={[styles.agent, styles.slotAgent].join(" ")}
            aria-labelledby="home-v2-title"
          >
            <div className={styles.titles}>
              <h1 id="home-v2-title" className={styles.h1}>
                {C.title}
              </h1>
              <p
                className={["sr-text-product-body-large", styles.lead].join(
                  " "
                )}
              >
                {C.subtitle}
              </p>
            </div>
            <AgentComposer
              value={idea}
              onChange={v => {
                setIdea(v);
                if (composerError) setComposerError(null);
              }}
              onSubmit={submitIdea}
              busy={composerBusy}
              error={composerError}
              helper={compact ? C.mobile.composerHelper : undefined}
            />
            <QuickActions
              compact={compact}
              onWrite={() => quick("write_script")}
              onImprove={() => quick("refine_script")}
              onHooks={() => quick("hook_ideas")}
            />
            <VideoLinkEntry
              onPaste={() => {
                track("paste_link");
                navigate("/collected?add=1");
              }}
            />
          </section>

          <section
            className={[styles.section, styles.slotIdeas].join(" ")}
            aria-labelledby="home-v2-ideas"
          >
            <div className={styles.sectionHeader}>
              <h2
                id="home-v2-ideas"
                className={["sr-text-product-heading-4", styles.h2].join(" ")}
              >
                {C.ideas.title}
              </h2>
              {hasPlan ? (
                <button
                  type="button"
                  className={ghostLink}
                  onClick={() => navigate("/plan")}
                >
                  {compact ? C.mobile.viewPlan : C.ideas.viewPlan}
                </button>
              ) : null}
            </div>
            {planQ.isLoading ? (
              <IdeasSkeleton />
            ) : planQ.isError ? (
              <StateCard
                stack
                title={C.ideas.errorTitle}
                body={C.ideas.errorBody}
                action={
                  <button
                    type="button"
                    className={styles.outline}
                    onClick={() => void planQ.refetch()}
                  >
                    {C.tryAgain}
                  </button>
                }
              />
            ) : ideas.length > 0 ? (
              <div className={styles.twoUp}>
                {ideas.map(i => (
                  <IdeaCard
                    key={i.id}
                    idea={i}
                    compact={compact}
                    onWrite={() => writeIdea(i.id)}
                  />
                ))}
              </div>
            ) : (
              <StateCard
                dashed
                title={C.ideas.emptyTitle}
                body={C.ideas.emptyBody}
                action={
                  <PrimaryButton
                    onClick={() => {
                      track("create_plan");
                      navigate("/plan");
                    }}
                  >
                    {C.ideas.emptyAction}
                  </PrimaryButton>
                }
              />
            )}
          </section>

          <section
            className={[styles.section, styles.slotVideos].join(" ")}
            aria-labelledby="home-v2-videos"
          >
            <div
              className={[styles.sectionHeader, styles.sectionHeaderEnd].join(
                " "
              )}
            >
              <div className={styles.sectionTitles}>
                <h2
                  id="home-v2-videos"
                  className={["sr-text-product-heading-4", styles.h2].join(" ")}
                >
                  {C.videos.title}
                </h2>
                <p
                  className={["sr-text-product-body-small", styles.muted].join(
                    " "
                  )}
                >
                  {videosSubtitle}
                </p>
              </div>
              <button
                type="button"
                className={ghostLink}
                onClick={() => navigate("/viral-posts")}
              >
                {compact ? C.mobile.seeMore : C.videos.seeMore}
              </button>
            </div>
            {videosQ.isLoading ? (
              <div className={styles.twoUp}>
                <ResultSkeleton />
                <ResultSkeleton />
              </div>
            ) : videosQ.isError ? (
              <StateCard
                stack
                title={C.videos.errorTitle}
                body={C.videos.errorBody}
                action={
                  <button
                    type="button"
                    className={styles.outline}
                    onClick={() => void videosQ.refetch()}
                  >
                    {C.tryAgain}
                  </button>
                }
              />
            ) : videos && videos.items.length > 0 ? (
              <div className={styles.twoUp}>
                {videos.items.map(post => {
                  const p = {
                    ...post,
                    saved: savedOverride[post.id] ?? post.saved,
                  };
                  return (
                    <HomeVideoCard
                      key={post.id}
                      post={p}
                      compact={compact}
                      busy={remakeBusyId === post.id}
                      onPlay={() => setPlayingVideoId(post.id)}
                      onRemake={() => void createFromVideo(post)}
                      onToggleSave={() => void toggleSave(p)}
                    />
                  );
                })}
              </div>
            ) : (
              <StateCard
                stack
                title={C.videos.emptyTitle}
                body={C.videos.emptyBody}
                action={
                  <button
                    type="button"
                    className={styles.outline}
                    onClick={() => navigate("/viral-posts")}
                  >
                    {C.videos.seeMore}
                  </button>
                }
              />
            )}
          </section>
        </div>

        <aside className={styles.rail} aria-labelledby="home-v2-creators">
          <section className={styles.slotCreators} aria-labelledby="home-v2-creators">
            <div className={styles.sectionTitles}>
              <h2
                id="home-v2-creators"
                className={["sr-text-product-heading-4", styles.h2].join(" ")}
              >
                {C.creators.title}
              </h2>
              <p
                className={["sr-text-product-body-small", styles.muted].join(" ")}
              >
                {creatorsSubtitle}
              </p>
            </div>
            {creatorsQ.isLoading ? (
              <CreatorsSkeleton />
            ) : creatorsQ.isError ? (
              <StateCard
                stack
                title={C.creators.errorTitle}
                body={C.creators.errorBody}
                action={
                  <button
                    type="button"
                    className={styles.outline}
                    onClick={() => void creatorsQ.refetch()}
                  >
                    {C.tryAgain}
                  </button>
                }
              />
            ) : creators && creators.creators.length > 0 ? (
              <div className={[styles.card, styles.creatorsCard].join(" ")}>
                {creators.creators.map(c => (
                  <div key={c.id}>
                    <CreatorRow
                      creator={c}
                      compact={compact}
                      onSee={() => {
                        track("creator_open");
                        navigate(`/dashboard?featuredAccountId=${c.id}`);
                      }}
                    />
                    <div className={styles.divider} />
                  </div>
                ))}
                <div className={styles.footerLinks}>
                  <button
                    type="button"
                    className={ghostLink}
                    onClick={() => navigate("/research")}
                  >
                    {C.creators.findMore}
                  </button>
                  <button
                    type="button"
                    className={ghostLink}
                    onClick={() => navigate("/history")}
                  >
                    {compact ? C.mobile.radar : C.creators.radar}
                  </button>
                </div>
              </div>
            ) : (
              <StateCard
                stack
                title={C.creators.emptyTitle}
                body={C.creators.emptyBody}
                action={
                  <button
                    type="button"
                    className={styles.outline}
                    onClick={() => navigate("/research")}
                  >
                    {C.creators.findMore}
                  </button>
                }
              />
            )}
          </section>
          {ctx?.hasProfile ? (
            <div className={styles.slotInvite}>
              <ProfilesInvite compact={compact} onManage={() => setProfilesOpen(true)} />
            </div>
          ) : null}
        </aside>

        {playingPost ? (
          <ViralPostPlayer key={playingPost.id} post={playingPost} onClose={closePlayer} />
        ) : null}
        {profilesOpen ? (
          <ManageProfilesModal
            profiles={profilesQ.data ?? []}
            busy={switchProfile.isPending || profilesQ.isLoading}
            onAdd={addProfile}
            onUse={id => void switchTo(id)}
            onClose={() => setProfilesOpen(false)}
          />
        ) : null}
        {RemakeDialogs}
      </div>
    </div>
  );
}
