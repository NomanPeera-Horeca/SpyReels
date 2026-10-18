/**
 * Desktop right-panel previews for onboarding v2 (Figma page 15).
 *
 * - ViralStackPreview: steps 1 and "I don't post yet". A decorative stack of
 *   empty Result Cards with tier badges, exactly as in the approved frame. It
 *   shows no account data, so it is hidden from assistive tech.
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
import { AnalysisStatusChecklist } from "@/design-system/AnalysisStatus";
import { DevicePhoneFrame } from "@/design-system/DevicePhoneFrame";
import { IconPlay } from "@/design-system/icons";
import { ANALYSIS_STAGE_COPY, COPY } from "./copy";
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
const STACK: Array<{ left: number; top: number; rotate: number; badge: string }> = [
  { left: 57, top: 151, rotate: 8, badge: "Strong · 48x followers" },
  { left: 271, top: 176, rotate: -8, badge: "Viral · 130x followers" },
  { left: 398, top: 260, rotate: -3, badge: "Healthy · 12x followers" },
  { left: 89, top: 406, rotate: 4, badge: "Strong · 25x followers" },
  { left: 281, top: 445, rotate: -6, badge: "Strong · 34x followers" },
];

export function ViralStackPreview() {
  return (
    <div className={styles.stack} aria-hidden>
      {STACK.map(card => (
        <div
          key={card.badge}
          className={styles.stackCard}
          style={{ left: card.left, top: card.top, transform: `rotate(${card.rotate}deg)` }}
        >
          <span className={["sr-text-product-caption", styles.tierBadge].join(" ")}>
            {card.badge}
          </span>
          <span className={styles.play}>
            <IconPlay />
          </span>
        </div>
      ))}
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
