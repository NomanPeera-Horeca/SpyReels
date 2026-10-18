import { SPYREELS_LOGO_PATH } from "@/lib/brandAssets";
import styles from "./BrandLogo.module.css";

/**
 * Brand / SpyReels Logo, Theme=Light (Figma 133:102, 132x45 slot).
 * Same treatment as the live marketing header: the official mark file plus
 * the "SpyReels" wordmark. The mark is never redrawn or recolored.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={[styles.root, className].filter(Boolean).join(" ")}
      aria-label="SpyReels"
      role="img"
    >
      <img
        className={styles.mark}
        src={SPYREELS_LOGO_PATH}
        alt=""
        width={32}
        height={32}
      />
      <span className={styles.word} aria-hidden>
        SpyReels
      </span>
    </span>
  );
}
