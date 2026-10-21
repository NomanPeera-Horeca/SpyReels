/**
 * Desktop right-panel previews for onboarding v2 (Figma page 15).
 *
 * - ViralStackPreview: steps 1 and "I don't post yet". The approved tilted
 *   cards, filled with muted looping videos from the Viral Finder catalogs.
 * - ProfilePhonePreview: step 2. The visitor view of the creator's real
 *   public profile inside the approved phone frame.
 * - AnalysisPreview: steps 3a and 3b. Profile row plus the analysis
 *   checklist, whose stage states come only from the real analysis run.
 */
import type {
  AnalysisRunStatus,
  AnalysisStage,
  AnalysisStageStatus,
} from "@shared/personalization/model";
import { ANALYSIS_STAGES } from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { useEffect, useState } from "react";
import { AnalysisStatusChecklist } from "@/design-system/AnalysisStatus";
import { DevicePhoneFrame } from "@/design-system/DevicePhoneFrame";
import { trpc } from "@/lib/trpc";
import {
  attemptsForStackSlot,
  ONBOARDING_VERIFIED_POSTERS,
} from "@shared/onboardingPreviewMedia";
import {
  alignOnboardingStackSlots,
  ONBOARDING_STACK_ORDER,
} from "@shared/onboardingViralStack";
import { ANALYSIS_STAGE_COPY, COPY } from "./copy";
import { AmbientStackCard } from "./ambientViralMedia";
import { MobileProfileCard } from "./MobileProfileCard";
import styles from "./previews.module.css";
import {
  InstagramVisitorProfile,
  TikTokVisitorProfile,
  YouTubeVisitorProfile,
} from "./VisitorProfile";

/**
 * From the Figma frame (1078:366), right-panel space. Figma gives the
 * rotated bounding box; left/top here are the unrotated 180x320 card,
 * centered in that box.
 */
const STACK: Array<{ left: number; top: number; rotate: number }> = [
  { left: 57, top: 151, rotate: 8 },
  { left: 271, top: 176, rotate: -8 },
  { left: 398, top: 260, rotate: -3 },
  { left: 89, top: 406, rotate: 4 },
  { left: 281, top: 445, rotate: -6 },
];

const WIDE_PANEL = "(min-width: 901px)";

function useWidePanel(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(WIDE_PANEL).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(WIDE_PANEL);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return wide;
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export function ViralStackPreview() {
  const wide = useWidePanel();
  const pageVisible = usePageVisible();
  const stack = trpc.onboardingPreview.viralStack.useQuery(undefined, {
    enabled: wide,
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (!wide) return null;
  const aligned = alignOnboardingStackSlots(stack.data?.slots ?? []);

  return (
    <div className={styles.stack} data-stack-state={stack.data ? "ready" : "pending"} aria-hidden>
      {ONBOARDING_STACK_ORDER.map((platform, index) => {
        const place = STACK[index];
        const fallback = ONBOARDING_VERIFIED_POSTERS[index];
        if (!place || !fallback) return null;
        const slot = aligned[index];
        return (
          <div
            key={`${platform}-${index}`}
            className={styles.stackCard}
            data-stack-slot={platform}
            style={{
              left: place.left,
              top: place.top,
              transform: `rotate(${place.rotate}deg)`,
            }}
          >
            <AmbientStackCard
              platform={platform}
              attempts={attemptsForStackSlot(slot, index)}
              fallbackThumbnail={fallback.thumbnailUrl}
              active={pageVisible}
            />
          </div>
        );
      })}
    </div>
  );
}

export function VisitorProfileScreen({
  profile,
  hideBack = false,
}: {
  profile: PublicProfilePreview;
  hideBack?: boolean;
}) {
  if (profile.platform === "instagram")
    return <InstagramVisitorProfile profile={profile} hideBack={hideBack} />;
  if (profile.platform === "tiktok")
    return <TikTokVisitorProfile profile={profile} hideBack={hideBack} />;
  return <YouTubeVisitorProfile profile={profile} hideBack={hideBack} />;
}

export function ProfilePhonePreview({
  profile,
  hideBack = false,
}: {
  profile: PublicProfilePreview;
  hideBack?: boolean;
}) {
  return (
    <DevicePhoneFrame
      label={`@${profile.handle} public profile`}
      tone={profile.platform === "youtube" ? "dark" : "light"}
      className={styles.phone}
    >
      <VisitorProfileScreen profile={profile} hideBack={hideBack} />
    </DevicePhoneFrame>
  );
}

/** Mobile step 2: the compact platform profile card from the approved mobile frames (no phone frame, no post grid). */
export function ProfileMobilePreview({ profile }: { profile: PublicProfilePreview }) {
  return (
    <div className={styles.mobileProfile} aria-label={`@${profile.handle} public profile`}>
      <MobileProfileCard profile={profile} />
    </div>
  );
}

export type AnalysisView = {
  status: AnalysisRunStatus;
  stages: Partial<Record<AnalysisStage, AnalysisStageStatus>>;
} | null;

export function AnalysisPreview({
  displayName,
  handle,
  avatarUrl,
  analysis,
}: {
  displayName: string | null;
  /** As typed, without @. */
  handle: string;
  avatarUrl: string | null;
  analysis: AnalysisView;
}) {
  const stages = ANALYSIS_STAGES.map(key => ({
    key,
    ...ANALYSIS_STAGE_COPY[key],
    status: analysis?.stages[key] ?? ("waiting" as const),
  }));
  return (
    <div className={styles.analysis}>
      <div className={styles.identity}>
        {avatarUrl ? (
          <img className={styles.avatar} src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className={styles.avatar} />
        )}
        <span className={styles.identityText}>
          {displayName ? (
            <span className={["sr-text-product-card-title", styles.name].join(" ")}>
              {displayName}
            </span>
          ) : null}
          <span className={["sr-text-product-body-small", styles.handle].join(" ")}>
            @{handle}
          </span>
        </span>
      </div>
      <AnalysisStatusChecklist
        className={styles.checklistCard}
        heading={COPY.checklistHeading}
        stages={stages}
      />
    </div>
  );
}
