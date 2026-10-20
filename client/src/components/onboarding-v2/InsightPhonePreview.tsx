/**
 * Step 4 right panel. The approved phone frame, with the creator's own video
 * and a white card over it. The card renders only for a calculated insight.
 */
import { useCallback, useEffect, useState } from "react";
import type { SocialPlatform } from "@shared/personalization/model";
import type { PanelInsight } from "@shared/personalization/performanceInsights";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { formatProfileCount } from "@shared/personalization/publicProfilePreview";
import { DevicePhoneFrame } from "@/design-system/DevicePhoneFrame";
import { ReelDialogVideo } from "@/components/ReelDialogVideo";
import { COPY } from "./copy";
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
  const views =
    showCard && typeof panel.views === "number"
      ? `${formatProfileCount(panel.views)} ${C.views}`
      : null;

  if (playbackFailed && !thumbnailUrl) {
    return profile ? <ProfilePhonePreview profile={profile} /> : null;
  }

  const showThumbnail = Boolean(thumbnailUrl) && (!videoUrl || playbackFailed);

  return (
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
        {showCard && panel.figure ? (
          <div className={styles.card}>
            <p className={["sr-text-product-heading-4", styles.figure].join(" ")}>{panel.figure}</p>
            <p className={["sr-text-product-card-title", styles.headline].join(" ")}>{panel.headline}</p>
            <p className={["sr-text-product-body-small", styles.support].join(" ")}>{panel.support}</p>
            {views ? (
              <p className={["sr-text-product-caption", styles.views].join(" ")}>{views}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </DevicePhoneFrame>
  );
}
