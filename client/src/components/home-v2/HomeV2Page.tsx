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
 * - Creators: homeV2.creators (same indexed Viral Posts inventory as videos; no scraping).
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
import { AddPlatformDialog } from "./AddPlatformDialog";
import { PrismRemakeDialog, prismBrief } from "./PrismRemakeDialog";
import { researchReturnTo } from "@shared/researchIntent";
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
  PLATFORMS,
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
  const searchIdeasQ = trpc.homeV2.searchIdeas.useQuery(undefined, {
    refetchOnWindowFocus: false,
    // Right after onboarding a new niche has no search ideas yet: check again until they arrive.
    refetchInterval: q => {
      const d = q.state.data;
      return d && d.ideas.length === 0 ? 30_000 : false;
    },
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
  const [playingPost, setPlayingPost] = useState<ViralPost | null>(null);
  // "Your viral videos": the creator's own winners, remade through the Content Prism.
  const ownWinnersQ = trpc.homeV2.ownWinners.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [prismPost, setPrismPost] = useState<ViralPost | null>(null);
  const closePlayer = useCallback(() => setPlayingPost(null), []);

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
    const planIdeas: HomeIdea[] = cards
      .filter(c => c.status !== "posted" && c.coachScriptId == null)
      .slice(0, 2)
      .map(c => ({ id: c.id, title: c.title, hook: c.hook || null }));
    // Fill the rest with phrases people really search in this niche.
    const searched: HomeIdea[] = (searchIdeasQ.data?.ideas ?? []).map(i => ({
      id: `search:${i.phrase}`,
      title: i.title,
      hook: null,
      badge:
        i.searchVolume != null && i.searchVolume >= 10
          ? C.ideas.searchedVolume(compactNumber(i.searchVolume))
          : i.viralFound > 0
            ? C.ideas.searchedProven(i.viralFound)
            : C.ideas.searched,
    }));
    // Until search ideas exist, the creator's own pillar sub-topics are the ideas.
    const fromPillars: HomeIdea[] = (searchIdeasQ.data?.pillarIdeas ?? []).map(i => ({
      id: `pillar:${i.label}|pillar|${i.pillarTitle}`,
      title: i.label,
      hook: null,
      badge: C.ideas.fromPillar(i.pillarTitle),
    }));
    return [...planIdeas, ...searched, ...fromPillars].slice(0, 2);
  }, [planQ.data, searchIdeasQ.data]);
  const hasPlan = (planQ.data?.calendarCards.length ?? 0) > 0;

  const remakeWithPrism = (post: ViralPost, formatId: string) => {
    track("own_winner_prism", { platform: post.platform, format: formatId });
    sendSignal(post, "remake_started");
    try {
      sessionStorage.setItem(STUDIO_PREFILL_KEY, prismBrief(post, formatId));
    } catch {
      // Storage blocked: the Agent opens empty; the user can still type.
    }
    setPrismPost(null);
    navigate("/studio");
  };

  const writeIdea = (id: number | string) => {
    if (typeof id === "string" && id.startsWith("pillar:")) {
      const [label, pillar] = id.slice("pillar:".length).split("|pillar|");
      track("idea_write_pillar");
      try {
        sessionStorage.setItem(
          STUDIO_PREFILL_KEY,
          `Write a short-form video script about "${label}"${pillar ? `, for my content pillar "${pillar}"` : ""}.`
        );
      } catch {
        // Storage blocked: the Agent opens empty; the user can still type.
      }
      navigate("/studio");
      return;
    }
    if (typeof id === "string") {
      const phrase = id.replace(/^search:/, "");
      track("idea_write_searched", { words: phrase.split(/\s+/).length });
      try {
        sessionStorage.setItem(
          STUDIO_PREFILL_KEY,
          `Write a short-form video script about "${phrase}".\n\nPeople search this exact phrase on Google and YouTube, so use it word for word in the hook, the on-screen text and the caption.`
        );
      } catch {
        // Storage blocked: the Agent opens empty; the user can still type.
      }
      navigate("/studio");
      return;
    }
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
  // Measurement for the ranking trial: the same signals for every ranking.
  // Fire-and-forget; never blocks or errors the page. Library posts only (numeric ids).
  const signal = trpc.viralPosts.feedback.useMutation();
  const sendSignal = (
    post: ViralPost,
    feedbackType: "post_impression" | "remake_started" | "not_my_niche"
  ) => {
    if (!/^\d+$/.test(post.id)) return;
    signal.mutate({ postId: post.id, feedbackType }, { onError: () => {} });
  };
  const [hiddenPosts, setHiddenPosts] = useState<Record<string, true>>({});
  const markNotRelevant = (post: ViralPost) => {
    sendSignal(post, "not_my_niche");
    track("video_not_relevant", { platform: post.platform });
    setHiddenPosts(h => ({ ...h, [post.id]: true }));
    toast.success(C.videos.notRelevantThanks);
  };
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
    sendSignal(post, "remake_started");
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

  // Loaded with Home: the add-platform chips need to know what is already added.
  const profilesQ = trpc.homeV2.profiles.useQuery(undefined, {
    enabled: profilesOpen || Boolean(ctx?.hasProfile),
  });
  const missingPlatforms = PLATFORMS.filter(
    p => !(profilesQ.data ?? []).some(x => x.platform === p.id && x.handle)
  );
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

  // "+ TikTok" opens a small popup (no onboarding page): handle, "Is this you?", done.
  const [addingPlatform, setAddingPlatform] = useState<SocialPlatform | null>(null);
  const addProfile = (platform: SocialPlatform) => {
    track("profile_add", { platform });
    setProfilesOpen(false);
    setAddingPlatform(platform);
  };

  /* ---------- render ---------- */

  const nicheLabel = ctx?.nicheLabel ?? null;
  const showBanner = Boolean(ctx) && !complete && !bannerDismissed;
  const creators = creatorsQ.data;
  const videos = videosQ.data;
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
              ) : ideas.length > 0 ? (
                // Search ideas fill the section: keep the way to a full plan.
                <button
                  type="button"
                  className={ghostLink}
                  onClick={() => {
                    track("create_plan");
                    navigate("/plan");
                  }}
                >
                  {C.ideas.emptyAction}
                </button>
              ) : null}
            </div>
            {planQ.isLoading ? (
              <IdeasSkeleton />
            ) : planQ.isError && ideas.length === 0 ? (
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
            {(ownWinnersQ.data?.items.length ?? 0) > 0 ? (
              <div className={styles.ownWinners} data-testid="home-own-winners">
                <div className={styles.sectionTitles}>
                  <h2 className={["sr-text-product-heading-4", styles.h2].join(" ")}>{C.ownWinners.title}</h2>
                  <p className={["sr-text-product-body-small", styles.muted].join(" ")}>{C.ownWinners.subtitle}</p>
                </div>
                <div className={styles.videoGrid}>
                  {ownWinnersQ.data!.items.map(post => (
                    <HomeVideoCard
                      key={`own-${post.id}`}
                      post={post}
                      compact={compact}
                      busy={false}
                      onPlay={() => setPlayingPost(post)}
                      onRemake={() => {
                        track("own_winner_remake_open", { platform: post.platform });
                        setPrismPost(post);
                      }}
                      onToggleSave={() => void toggleSave(post)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
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
              <div className={styles.videoGrid}>
                {Array.from({ length: 4 }, (_, i) => (
                  <ResultSkeleton key={i} mediaFormat="portrait" />
                ))}
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
              <div className={styles.videoGrid}>
                {videos.items.filter(post => !hiddenPosts[post.id]).map(post => {
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
                      onPlay={() => setPlayingPost(post)}
                      onRemake={() => void createFromVideo(post)}
                      onToggleSave={() => void toggleSave(p)}
                      onSeen={() => sendSignal(post, "post_impression")}
                      onNotRelevant={() => markNotRelevant(post)}
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
                      onOpen={() => {
                        track("creator_open", { platform: c.platform });
                        try {
                          navigate(researchReturnTo(c.handle, c.platform));
                        } catch {
                          navigate("/research");
                        }
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
          {ctx?.hasProfile && profilesQ.data && missingPlatforms.length > 0 ? (
            <div className={styles.slotInvite}>
              <ProfilesInvite compact={compact} missing={missingPlatforms} onAdd={addProfile} />
            </div>
          ) : null}
          {/* Switching stays possible once there is more than one profile (no card). */}
          {(profilesQ.data ?? []).filter(x => x.handle).length > 1 ? (
            <button
              type="button"
              className={[styles.ghost, styles.switchProfileLink].join(" ")}
              onClick={() => setProfilesOpen(true)}
            >
              {C.profiles.switchProfile}
            </button>
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
        {prismPost ? (
          <PrismRemakeDialog
            post={prismPost}
            onPick={formatId => remakeWithPrism(prismPost, formatId)}
            onClose={() => setPrismPost(null)}
          />
        ) : null}
        {addingPlatform ? (
          <AddPlatformDialog
            platform={addingPlatform}
            label={PLATFORMS.find(p => p.id === addingPlatform)?.label ?? addingPlatform}
            onClose={() => setAddingPlatform(null)}
            onAdded={() => {
              track("profile_added_inline", { platform: addingPlatform });
              setAddingPlatform(null);
              void utils.homeV2.invalidate();
            }}
          />
        ) : null}
        {RemakeDialogs}
      </div>
    </div>
  );
}

/** 12100 -> "12K", 1500 -> "1.5K", 900 -> "900". */
function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}
