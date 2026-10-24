import type { ReactNode } from "react";
import styles from "./DevicePhoneFrame.module.css";

/**
 * Pattern / Device Phone Frame (Figma 1164:1031, owner approved).
 * 390x800 thin-bezel frame, Dynamic Island cutout, light clipped viewport.
 * `children` render inside the 374x734 content area below the status bar.
 */
export function DevicePhoneFrame({
  children,
  label,
  tone = "light",
  viewportClassName,
  className,
}: {
  children: ReactNode;
  /** Accessible name for the preview region. */
  label: string;
  /** dark = white status bar on a dark app screen (YouTube visitor view). */
  tone?: "light" | "dark";
  /** Lets a platform screen paint the viewport behind the status bar. */
  viewportClassName?: string;
  className?: string;
}) {
  return (
    <figure
      className={[styles.frame, className].filter(Boolean).join(" ")}
      aria-label={label}
      data-onboarding-phone=""
    >
      <div
        className={[styles.viewport, tone === "dark" && styles.dark, viewportClassName]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.statusBar} aria-hidden>
          <span className={["sr-text-product-caption", styles.time].join(" ")}>
            9:41
          </span>
          <StatusIcons ink={tone === "dark" ? "var(--sr-white)" : undefined} />
        </div>
        <div className={styles.content}>{children}</div>
      </div>
      <span className={styles.island} aria-hidden />
      <span className={styles.sideButton} aria-hidden />
    </figure>
  );
}

/** Status icons from the frame (1200:18679), exported unchanged. */
function StatusIcons({ ink = "var(--sr-neutral-950)" }: { ink?: string }) {
  return (
    <svg width="66" height="12" viewBox="0 0 66 12" fill="none" aria-hidden>
      <path d="M2 8H1C0.447715 8 0 8.44772 0 9V11C0 11.5523 0.447715 12 1 12H2C2.55228 12 3 11.5523 3 11V9C3 8.44772 2.55228 8 2 8Z" fill={ink} />
      <path d="M6.5 6H5.5C4.94772 6 4.5 6.44772 4.5 7V11C4.5 11.5523 4.94772 12 5.5 12H6.5C7.05228 12 7.5 11.5523 7.5 11V7C7.5 6.44772 7.05228 6 6.5 6Z" fill={ink} />
      <path d="M11 3.5H10C9.44772 3.5 9 3.94772 9 4.5V11C9 11.5523 9.44772 12 10 12H11C11.5523 12 12 11.5523 12 11V4.5C12 3.94772 11.5523 3.5 11 3.5Z" fill={ink} />
      <path d="M15.5 1H14.5C13.9477 1 13.5 1.44772 13.5 2V11C13.5 11.5523 13.9477 12 14.5 12H15.5C16.0523 12 16.5 11.5523 16.5 11V2C16.5 1.44772 16.0523 1 15.5 1Z" fill={ink} />
      <path d="M28 4.19998C29.4559 2.93372 31.3205 2.23633 33.25 2.23633C35.1795 2.23633 37.0441 2.93372 38.5 4.19998M30 6.59998C30.9057 5.82533 32.0582 5.39965 33.25 5.39965C34.4418 5.39965 35.5943 5.82533 36.5 6.59998M32 8.99998C32.3547 8.71597 32.7956 8.56123 33.25 8.56123C33.7044 8.56123 34.1453 8.71597 34.5 8.99998" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M59.5 1H45.5C43.8431 1 42.5 2.34315 42.5 4V8C42.5 9.65685 43.8431 11 45.5 11H59.5C61.1569 11 62.5 9.65685 62.5 8V4C62.5 2.34315 61.1569 1 59.5 1Z" stroke={ink} strokeOpacity="0.4" />
      <path d="M58 3H46C45.1716 3 44.5 3.67157 44.5 4.5V7.5C44.5 8.32843 45.1716 9 46 9H58C58.8284 9 59.5 8.32843 59.5 7.5V4.5C59.5 3.67157 58.8284 3 58 3Z" fill={ink} />
      <path d="M64.3 4H64.2C63.8134 4 63.5 4.3134 63.5 4.7V7.3C63.5 7.6866 63.8134 8 64.2 8H64.3C64.6866 8 65 7.6866 65 7.3V4.7C65 4.3134 64.6866 4 64.3 4Z" fill={ink} fillOpacity="0.4" />
    </svg>
  );
}
