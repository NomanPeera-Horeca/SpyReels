/**
 * Step 4 right panel. The approved phone frame, with the creator's own video
 * and a white card over it. The card renders only for a calculated insight.
 */
import { useCallback, useEffect, useState } from "react";
import type { SocialPlatform } from "@shared/personalization/model";
import type { PanelInsight } from "@shared/personalization/performanceInsights";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { formatViewCount } from "@shared/personalization/publicProfilePreview";
import { DevicePhoneFrame } from "@/design-system/DevicePhoneFrame";
import { ReelDialogVideo } from "@/components/ReelDialogVideo";
import { COPY } from "./copy";
import { insightCardLines } from "./insightPanel";
import { ProfilePhonePreview } from "./previews";
import styles from "./InsightPhonePreview.module.css";

const C = COPY.insight;

export function InsightPhonePreview({
  platform,
  panel,
  showCard,
  profile,
}: {
  platform: SocialPlatform;
  panel: PanelInsight;
  showCard: boolean;
  profile: PublicProfilePreview | null;
}) {
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const onPlaybackFailed = useCallback(() => setPlaybackFailed(true), []);
  const videoUrl = panel.videoUrl?.trim() ?? "";
  const thumbnailUrl = panel.thumbnailUrl?.trim() ?? "";
  useEffect(() => {
    setPlaybackFailed(false);
  }, [panel.postId, videoUrl]);
  const lines = showCard ? insightCardLines(panel) : null;
  const views =
    lines && typeof panel.views === "number" ? `${formatViewCount(panel.views)} ${COPY.whatWorks.views}` : null;

  if (playbackFailed && !thumbnailUrl) {
    return profile ? <ProfilePhonePreview profile={profile} /> : null;
  }

  const showThumbnail = Boolean(thumbnailUrl) && (!videoUrl || playbackFailed);

  return (
    <div className={[styles.fit, lines ? styles.fitCard : ""].filter(Boolean).join(" ")} data-onboarding-phone="">
      <DevicePhoneFrame label={C.label} tone="dark" className={styles.phone}>
        <div className={styles.stage}>
          {showThumbnail ? (
            <img src={thumbnailUrl} alt="" className={styles.video} />
          ) : (
            <ReelDialogVideo
              platform={platform}
              shortcode={platform === "instagram" ? panel.postId : null}
              videoUrl={videoUrl}
              thumbnailUrl={thumbnailUrl || null}
              autoPlay
              muted
              loop
              controls={false}
              posterFallback
              onPlaybackFailed={onPlaybackFailed}
              className={styles.video}
            />
          )}
          {views ? <p className={["sr-text-product-caption", styles.badge].join(" ")}>{views}</p> : null}
        </div>
      </DevicePhoneFrame>
      {lines ? (
        <div className={styles.card}>
          {lines.eyebrow ? (
            <p className={["sr-text-product-caption", styles.eyebrow].join(" ")}>{lines.eyebrow}</p>
          ) : null}
          <p className={["sr-text-product-card-title", styles.figure].join(" ")}>{lines.figureLine}</p>
          <p className={["sr-text-product-body-small", styles.detail].join(" ")}>{lines.detail}</p>
        </div>
      ) : null}
    </div>
  );
}
