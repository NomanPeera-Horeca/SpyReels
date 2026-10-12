"use client";

import { useState } from "react";
import {
  formatHookPatternLabel,
  type ViralHook,
} from "../../../../shared/hookGenerator";
import { MarketingCard } from "../../../components/MarketingCard";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { SecondaryButton } from "../../../components/SecondaryButton";
import { wrapHyphenatedCompounds } from "../../../components/marketingNoBreak";
import styles from "./ViralHooksTool.module.css";

type ViralHooksHookCardProps = {
  hook: ViralHook;
  index: number;
  onTurnIntoScript?: () => void;
  turnIntoScriptPending?: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ViralHooksHookCard({
  hook,
  index,
  onTurnIntoScript,
  turnIntoScriptPending,
}: ViralHooksHookCardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const onScreen = hook.onScreenText?.trim() || "";

  async function handleCopy(text: string, key: string) {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <MarketingCard as="article" className={styles.hookCard}>
      <div className={styles.hookBody}>
        <p className={`sr-text-product-label ${styles.hookLabel}`}>
          {wrapHyphenatedCompounds(`Hook ${index + 1}`)}
        </p>
        <p className={`sr-text-product-caption ${styles.fieldCaption}`}>Say this</p>
        <p className={`sr-text-product-body-medium ${styles.hookSpoken}`}>
          {wrapHyphenatedCompounds(hook.hook)}
        </p>

        {onScreen ? (
          <div className={styles.onScreenBox}>
            <p className={`sr-text-product-caption ${styles.fieldCaption}`}>
              On-screen text
            </p>
            <p className={`sr-text-product-label ${styles.onScreenText}`}>
              {wrapHyphenatedCompounds(onScreen)}
            </p>
          </div>
        ) : null}

        <p className={`sr-text-marketing-body-small ${styles.patternLine}`}>
          <span className="sr-text-product-label">Pattern:</span>{" "}
          {wrapHyphenatedCompounds(
            `${formatHookPatternLabel(hook.pattern)}${
              hook.reasoning ? `: ${hook.reasoning}` : ""
            }`
          )}
        </p>

        <div className={styles.copyRow}>
          <SecondaryButton
            type="button"
            size="medium"
            onClick={() => void handleCopy(hook.hook, "spoken")}
          >
            {copied === "spoken" ? "Copied" : "Copy spoken"}
          </SecondaryButton>
          {onScreen ? (
            <SecondaryButton
              type="button"
              size="medium"
              onClick={() => void handleCopy(onScreen, "screen")}
            >
              {copied === "screen" ? "Copied" : "Copy on-screen"}
            </SecondaryButton>
          ) : null}
          {onScreen ? (
            <SecondaryButton
              type="button"
              size="medium"
              onClick={() =>
                void handleCopy(`${hook.hook}\n\nOn-screen: ${onScreen}`, "both")
              }
            >
              {copied === "both" ? "Copied" : "Copy both"}
            </SecondaryButton>
          ) : null}
        </div>

        {onTurnIntoScript ? (
          <PrimaryButton
            type="button"
            size="medium"
            onClick={onTurnIntoScript}
            disabled={turnIntoScriptPending}
          >
            {turnIntoScriptPending
              ? "Opening script..."
              : "Turn into full script"}
          </PrimaryButton>
        ) : null}
      </div>

      <div className={styles.previewPane}>
        <p className={`sr-text-product-caption ${styles.fieldCaption}`}>
          Reel preview
        </p>
        <div className={styles.phone} aria-hidden>
          {onScreen ? (
            <p className={`sr-text-product-caption ${styles.phoneText}`}>
              {onScreen}
            </p>
          ) : null}
        </div>
      </div>
    </MarketingCard>
  );
}
