"use client";

import { useEffect, type ReactNode } from "react";
import { MarketingIconClose } from "./MarketingIcons";
import styles from "./MarketingDialog.module.css";

export type MarketingDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "small" | "medium";
  /** Optional eyebrow above the title. */
  eyebrow?: ReactNode;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Pattern / Dialog (Figma 68:143). */
export function MarketingDialog({
  open,
  onClose,
  title,
  titleId = "marketing-dialog-title",
  description,
  children,
  footer,
  size = "small",
  eyebrow,
}: MarketingDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop}>
      <button
        type="button"
        className={styles.backdropHit}
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(styles.panel, size === "medium" && styles.panelMedium)}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Close"
          onClick={onClose}
        >
          <MarketingIconClose />
        </button>
        {eyebrow ? <div>{eyebrow}</div> : null}
        <h2 id={titleId} className={cx("sr-text-marketing-heading-3", styles.title)}>
          {title}
        </h2>
        {description ? (
          <p className={cx("sr-text-product-body-small", styles.description)}>{description}</p>
        ) : null}
        {children ? <div className={styles.body}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}
