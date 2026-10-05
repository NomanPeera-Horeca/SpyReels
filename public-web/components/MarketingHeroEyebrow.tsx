import type { ReactNode } from "react";
import styles from "./MarketingHeroEyebrow.module.css";

type MarketingHeroEyebrowProps = {
  children: ReactNode;
  /** Optional live/status indicator before label text */
  showDot?: boolean;
};

export function MarketingHeroEyebrow({ children, showDot = false }: MarketingHeroEyebrowProps) {
  return (
    <div className={styles.root}>
      {showDot ? <span className={styles.dot} aria-hidden /> : null}
      {children}
    </div>
  );
}
