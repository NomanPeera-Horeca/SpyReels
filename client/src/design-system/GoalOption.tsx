import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconCheckInverse } from "./icons";
import styles from "./GoalOption.module.css";

type GoalOptionProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children" | "role" | "title" | "content"
> & {
  title: string;
  description?: string;
  /** Leading icon tile ("Show icon"). Hidden on mobile per the Figma spec. */
  icon?: ReactNode;
  selected: boolean;
  className?: string;
  /** "Show badge" + Badge Tone=Brand (Figma 1752:0), e.g. "Recommended". */
  badge?: string;
  /**
   * "Show content" slot (Figma 1752:6 / 1752:12): shown under the text while
   * the option is selected, and kept while the card or a control inside it
   * is hovered or focused ("Selected hover" / "Selected focus-visible").
   */
  content?: ReactNode;
  /** Keep the icon tile at phone width (Remake popup 390 frames show it). */
  iconOnMobile?: boolean;
};

/**
 * Card / Goal Option (Figma 1258:482). Default, Hover, Selected, Disabled,
 * Focus-visible, Selected hover, Selected focus-visible. The indicator is
 * visual only; the parent radiogroup owns the single selected value.
 * Selection is shown by surface, border AND the check mark, so it is never
 * color-only. Without badge/content it renders exactly as before.
 */
export function GoalOption({
  title,
  description,
  icon,
  selected,
  className,
  badge,
  content,
  iconOnMobile = false,
  type = "button",
  ...rest
}: GoalOptionProps) {
  const extended = badge != null || content != null;
  const iconTile = icon ? (
    <span className={styles.iconTile} aria-hidden>
      {icon}
    </span>
  ) : null;
  const titleNode = (
    <span className={["sr-text-product-card-title", styles.title].join(" ")}>{title}</span>
  );
  const text = (
    <span className={styles.text}>
      {badge != null ? (
        <span className={styles.titleRow}>
          {titleNode}
          <span className={["sr-text-product-caption", styles.badge].join(" ")}>{badge}</span>
        </span>
      ) : (
        titleNode
      )}
      {description ? (
        <span className={["sr-text-product-body-small", styles.description].join(" ")}>
          {description}
        </span>
      ) : null}
    </span>
  );
  const indicator = (
    <span className={styles.indicator} aria-hidden>
      {selected ? <IconCheckInverse size={14} /> : null}
    </span>
  );

  if (!extended) {
    return (
      <button
        type={type}
        role="radio"
        aria-checked={selected}
        className={[styles.root, selected && styles.selected, iconOnMobile && styles.iconOnMobile, className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {iconTile}
        {text}
        {indicator}
      </button>
    );
  }

  return (
    <div
      className={[
        styles.root,
        styles.extended,
        selected && styles.selected,
        rest.disabled && styles.disabled,
        iconOnMobile && styles.iconOnMobile,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type={type}
        role="radio"
        aria-checked={selected}
        className={styles.row}
        {...rest}
      >
        {iconTile}
        {text}
        {indicator}
      </button>
      {selected && content != null ? (
        <div className={[styles.content, icon ? styles.contentIndented : null].filter(Boolean).join(" ")}>
          {content}
        </div>
      ) : null}
    </div>
  );
}
