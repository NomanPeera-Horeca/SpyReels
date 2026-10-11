import type { ReactNode } from "react";
import styles from "./MarketingBadge.module.css";

export type MarketingBadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "info";

export type MarketingBadgeProps = {
  children: ReactNode;
  tone?: MarketingBadgeTone;
  icon?: ReactNode;
  className?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const TONE_CLASS: Record<MarketingBadgeTone, string> = {
  neutral: styles.neutral,
  brand: styles.brand,
  success: styles.success,
  warning: styles.warning,
  error: styles.error,
  info: styles.info,
};

/** Badge (Figma 34:5). */
export function MarketingBadge({
  children,
  tone = "neutral",
  icon,
  className,
}: MarketingBadgeProps) {
  return (
    <span className={cx(styles.root, TONE_CLASS[tone], className)}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span className={cx("sr-text-product-caption", styles.label)}>{children}</span>
    </span>
  );
}
