"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrollLandingMatch } from "../../../../shared/brollLanding";
import { MarketingBreadcrumb } from "../../../components/MarketingBreadcrumb";
import { MarketingDialog } from "../../../components/MarketingDialog";
import { MarketingIconCheck } from "../../../components/MarketingIcons";
import { MarketingSection } from "../../../components/MarketingSection";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { SecondaryButton } from "../../../components/SecondaryButton";
import { openHomepageAuth } from "../../../lib/openHomepageAuth";
import {
  clearBrollPendingPreview,
  peekBrollPendingPreview,
  stashBrollPreviewBeforeCheckout,
  type BrollPendingPreview,
  type BrollPreviewSnapshot,
} from "../../../lib/brollPendingPreview";
import { BROLL_PATH } from "../../../lib/brollLandingCopy";
import { trpcMutate, trpcQuery } from "../../../lib/trpcBrowser";
import { BrollDemoWidget } from "./BrollDemoWidget";
import styles from "./BrollGenerator.module.css";

const PRICING_BULLETS = [
  "Full-resolution clips, no watermark",
  "Save projects and regenerate beats",
  "Higher monthly B-roll generation limits",
  "Viral Reel Finder + AI Personal Brand Coach",
] as const;

export function BrollGeneratorClient() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [restorePending, setRestorePending] =
    useState<BrollPendingPreview | null>(null);
  const [watermarked, setWatermarked] = useState(true);
  const [canDownload, setCanDownload] = useState(false);
  const snapshotRef = useRef<BrollPreviewSnapshot | null>(null);

  useEffect(() => {
    setRestorePending(peekBrollPendingPreview());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadAuthAndQuota() {
      try {
        const [me, quota] = await Promise.all([
          trpcQuery<{ id: number } | null>("auth.me"),
          trpcQuery<{
            remaining: number;
            watermarked: boolean;
            canDownload: boolean;
            isAuthenticated: boolean;
          }>("brollLanding.quota"),
        ]);
        if (cancelled) return;
        setIsAuthenticated(Boolean(me?.id));
        setRemaining(quota.remaining);
        setWatermarked(quota.watermarked);
        setCanDownload(quota.canDownload);
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      }
    }
    void loadAuthAndQuota();
    function onFocus() {
      void loadAuthAndQuota();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const handleSnapshotChange = useCallback((snapshot: BrollPreviewSnapshot) => {
    snapshotRef.current = snapshot;
  }, []);

  const handleRestoreConsumed = useCallback(() => {
    clearBrollPendingPreview();
    setRestorePending(null);
  }, []);

  function stashPreviewIfPresent(): void {
    const snapshot = snapshotRef.current;
    if (snapshot?.phase === "results") {
      stashBrollPreviewBeforeCheckout(snapshot);
    }
  }

  function openSignup() {
    stashPreviewIfPresent();
    openHomepageAuth({ mode: "signup", returnTo: BROLL_PATH });
  }

  async function handleDownloadUnlocked(matches: BrollLandingMatch[]) {
    try {
      const result = await trpcMutate<{
        clips: Array<{ downloadUrl: string }>;
      }>("brollLanding.downloadClips", { matches });
      for (const clip of result.clips) {
        window.open(clip.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setPricingOpen(true);
    }
  }

  async function handleSeePlans() {
    if (!isAuthenticated) {
      setPricingOpen(false);
      openSignup();
      return;
    }
    if (snapshotRef.current) {
      stashBrollPreviewBeforeCheckout(snapshotRef.current);
    }
    setCheckoutBusy(true);
    try {
      const { url } = await trpcMutate<{ url: string | null }>("billing.checkout", {
        planId: "starter",
        interval: "monthly",
        origin: window.location.origin,
      });
      if (url) window.location.href = url;
    } catch {
      window.location.href = "/pricing";
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <>
      <MarketingSection pair="end" className={styles.heroSection}>
        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <MarketingBreadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: "Free Tools", href: "/free-tools" },
                { label: "B-Roll Generator" },
              ]}
            />
            <h1 className={`sr-text-marketing-display ${styles.heroTitle}`}>
              Free AI B-Roll Generator
            </h1>
            <p className={`sr-text-marketing-body-large ${styles.heroLead}`}>
              Paste your script, or upload footage you&apos;ve already shot.
              SpyReels matches every beat to real footage automatically and
              turns it into a fully B-rolled video. Fine-tune any clip you
              don&apos;t like, and more, in the best free AI B-roll generator
              online.
            </p>
            <div className={styles.heroActions}>
              <PrimaryButton href="#demo" size="large">
                Generate My B-Roll Preview
              </PrimaryButton>
              <a href="#sample-output" className={`sr-text-marketing-body-medium ${styles.heroSecondaryLink}`}>
                See a sample output first →
              </a>
            </div>
          </div>

          <BrollDemoWidget
            remaining={remaining}
            watermarked={watermarked}
            canDownload={canDownload}
            isAuthenticated={isAuthenticated}
            onQuotaChange={setRemaining}
            onSignUp={openSignup}
            onDownloadUnlocked={(m) => {
              void handleDownloadUnlocked(m);
            }}
            restorePending={restorePending}
            onRestoreConsumed={handleRestoreConsumed}
            onSnapshotChange={handleSnapshotChange}
          />
        </div>
      </MarketingSection>

      <MarketingDialog
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        eyebrow={
          <span className={`sr-text-marketing-eyebrow ${styles.cardEyebrowBrand}`}>
            Full-resolution download
          </span>
        }
        title="Unlock the watermark-free download"
        footer={
          <div className={styles.pricingFooterActions}>
            <SecondaryButton type="button" onClick={() => setPricingOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              disabled={checkoutBusy}
              onClick={() => void handleSeePlans()}
              trailingIcon={false}
              className={styles.generateBtn}
            >
              {checkoutBusy ? "Opening checkout…" : "See plans"}
            </PrimaryButton>
            <p className={`sr-text-product-caption ${styles.pricingFooterNote}`}>
              Previewing and saving stay free.
            </p>
          </div>
        }
      >
        <ul className={styles.pricingList}>
          {PRICING_BULLETS.map((line) => (
            <li key={line} className={styles.pricingListItem}>
              <MarketingIconCheck aria-hidden="true" />
              <span className="sr-text-product-body-small">{line}</span>
            </li>
          ))}
        </ul>
      </MarketingDialog>
    </>
  );
}
