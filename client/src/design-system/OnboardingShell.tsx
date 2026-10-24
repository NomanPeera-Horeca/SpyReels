import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { IconArrowLeft } from "./icons";
import styles from "./OnboardingShell.module.css";

/**
 * Pattern / Onboarding Shell (Figma 1026:997).
 * Desktop: 50/50 split, question on the left (white), preview on the right
 * (surface/subtle). Mobile: one column, back arrow next to the logo, no
 * preview panel, and a fixed bottom action bar.
 */
export function OnboardingShell({
  children,
  actions,
  mobileActions,
  preview,
  onBack,
  backLabel = "Back",
  contentWidth = "narrow",
  actionsPlacement = "bottom",
  testId,
}: {
  children: ReactNode;
  /** Desktop action row (Back on the left, primary on the right). */
  actions: ReactNode;
  /** Mobile fixed bottom bar. Defaults to `actions` when omitted. Pass `false` when the mobile actions sit inline in the content. */
  mobileActions?: ReactNode | false;
  /** Desktop right panel. Hidden on mobile. */
  preview?: ReactNode;
  /** Mobile top-left back arrow. Omit on the first step. */
  onBack?: () => void;
  backLabel?: string;
  /** narrow = 440 (steps 1 and 2), wide = 520 (steps 3 and 4). */
  contentWidth?: "narrow" | "wide";
  /** inline = actions follow the content (step 1); bottom = pinned low (others). */
  actionsPlacement?: "inline" | "bottom";
  testId?: string;
}) {
  return (
    <div className={["sr-scope-light", styles.shell].join(" ")} data-testid={testId}>
      <section className={styles.left}>
        <header className={styles.top}>
          {onBack ? (
            <button
              type="button"
              className={styles.mobileBack}
              onClick={onBack}
              aria-label={backLabel}
            >
              <IconArrowLeft />
            </button>
          ) : null}
          <BrandLogo />
        </header>
        <main
          className={[
            styles.body,
            contentWidth === "wide" ? styles.wide : styles.narrow,
            actionsPlacement === "inline" ? styles.inline : styles.pinned,
          ].join(" ")}
        >
          <div className={styles.content}>{children}</div>
          <div className={styles.desktopActions}>{actions}</div>
        </main>
        {mobileActions === false ? null : (
          <div className={styles.mobileBar}>{mobileActions ?? actions}</div>
        )}
      </section>
      {preview ? (
        <aside className={styles.right} aria-label="Preview" data-onboarding-preview="">
          {preview}
        </aside>
      ) : (
        <aside className={styles.right} aria-hidden data-onboarding-preview="" />
      )}
    </div>
  );
}
