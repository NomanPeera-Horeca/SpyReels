/**
 * Step 4 right panel. The approved phone frame, with the creator's own video
 * and a white card over it. Numbers come only from a calculated insight.
 */
import type { SocialPlatform } from "@shared/personalization/model";
import type { PanelInsight } from "@shared/personalization/performanceInsights";
import { formatProfileCount } from "@shared/personalization/publicProfilePreview";
import { DevicePhoneFrame } from "@/design-system/DevicePhoneFrame";
import { ReelDialogVideo } from "@/components/ReelDialogVideo";
import { COPY } from "./copy";
import styles from "./InsightPhonePreview.module.css";

const C = COPY.insight;

export function InsightPhonePreview({
  platform,
  panel,
  pending,
}: {
  platform: SocialPlatform;
  panel: PanelInsight | null;
  pending: boolean;
}) {
  const headline = panel?.headline ?? (pending ? C.pending : C.emptyTitle);
  const support = panel?.support ?? (pending ? C.pendingSupport : C.emptySupport);
  const views =
    panel && typeof panel.views === "number"
      ? `${formatProfileCount(panel.views)} ${C.views}`
      : null;
  return (
    <DevicePhoneFrame label={C.label} tone="dark" className={styles.phone}>
      <div className={styles.stage}>
        {panel ? (
          <ReelDialogVideo
            platform={platform}
            shortcode={platform === "instagram" ? panel.postId : null}
            videoUrl={panel.videoUrl}
            thumbnailUrl={panel.thumbnailUrl}
            autoPlay
            muted
            loop
            controls={false}
            className={styles.video}
          />
        ) : (
          <div className={styles.emptyStage} />
        )}
        <div className={styles.card}>
          {panel?.figure ? (
            <p className={["sr-text-product-heading-4", styles.figure].join(" ")}>{panel.figure}</p>
          ) : null}
          <p className={["sr-text-product-card-title", styles.headline].join(" ")}>{headline}</p>
          <p className={["sr-text-product-body-small", styles.support].join(" ")}>{support}</p>
          {views ? (
            <p className={["sr-text-product-caption", styles.views].join(" ")}>{views}</p>
          ) : null}
        </div>
      </div>
    </DevicePhoneFrame>
  );
}
