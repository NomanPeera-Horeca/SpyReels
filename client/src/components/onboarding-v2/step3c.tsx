/**
 * Step 3c "What works for you" (mobile only, Figma 1239:656). Desktop shows
 * this through the right panel instead, so the flow only routes here when
 * the layout has no right panel.
 *
 * Real data only: the best Reel row comes from the stored analysis snapshot
 * (pickBestPost). The "What your best Reels have in common" card needs
 * proven patterns, which do not exist yet, so it is hidden (build plan rule:
 * hide the card when there are no proven patterns).
 */
import { useState } from "react";
import type { BestPost } from "@shared/personalization/bestPost";
import { formatProfileCount } from "@shared/personalization/publicProfilePreview";
import { PrimaryButton } from "@/design-system/core";
import { IconAiSparkle, IconPlay } from "@/design-system/icons";
import { OnboardingShell } from "@/design-system/OnboardingShell";
import { COPY } from "./copy";
import styles from "./step3c.module.css";

const C = COPY.whatWorks;

export function WhatWorksStep({
  best,
  onBack,
  onContinue,
}: {
  best: BestPost;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const meta = [
    `${formatProfileCount(best.views)} ${C.views}`,
    best.followerMultiple !== null ? `${best.followerMultiple}x ${C.yourFollowers}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const continueButton = <PrimaryButton onClick={onContinue}>{COPY.continue}</PrimaryButton>;
  const thumb =
    best.thumbnailUrl && !thumbFailed ? (
      <img
        className={styles.thumbImage}
        src={best.thumbnailUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setThumbFailed(true)}
      />
    ) : null;
  return (
    <OnboardingShell
      onBack={onBack}
      contentWidth="wide"
      actions={continueButton}
      mobileActions={continueButton}
      testId="onboarding-step-what-works"
    >
      <div className={styles.header}>
        <h1 className={["sr-text-product-heading-1", styles.title].join(" ")}>{C.title}</h1>
        <p className={["sr-text-product-body-large", styles.subtitle].join(" ")}>
          <IconAiSparkle size={20} />
          {C.subtitle}
        </p>
      </div>
      <section className={styles.best}>
        {best.url ? (
          <a
            className={styles.thumb}
            href={best.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={C.play}
          >
            {thumb}
            <span className={styles.play}>
              <IconPlay size={14} />
            </span>
          </a>
        ) : (
          <span className={styles.thumb}>{thumb}</span>
        )}
        <div className={styles.text}>
          <span className={["sr-text-product-caption", styles.muted].join(" ")}>{C.label}</span>
          {best.title ? (
            <span className={["sr-text-product-card-title", styles.value, styles.clamp].join(" ")}>
              {best.title}
            </span>
          ) : null}
          <span className={["sr-text-product-caption", styles.muted].join(" ")}>{meta}</span>
        </div>
      </section>
    </OnboardingShell>
  );
}
