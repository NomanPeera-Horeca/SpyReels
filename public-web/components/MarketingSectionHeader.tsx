import type { ReactNode } from "react";
import { wrapHyphenatedCompounds } from "./marketingNoBreak";
import styles from "./MarketingSectionHeader.module.css";

export type MarketingSectionHeaderProps = {
  /** Optional; omitted for Large / centered Process Steps headers. */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Semantic heading level for the section title */
  headingLevel?: "h2" | "h3" | "h4";
  titleId?: string;
  className?: string;
  /**
   * Default = Heading 3 + Body Small.
   * Large + center = Heading 1 + Body Large.
   * Large + start = Heading 1 + Body Medium.
   */
  size?: "default" | "large";
  align?: "start" | "center";
  /**
   * When true, non-noBreak spans inside Large titles use marketing accent.
   * Defaults off so unused highlight content does not tint layout.
   */
  showHighlight?: boolean;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Marketing / Section Header — Figma Page 09 v1.2.
 * Default/Start, Large/Center, Large/Start. showHighlight defaults off.
 */
export function MarketingSectionHeader({
  eyebrow,
  title,
  subtitle,
  headingLevel = "h2",
  titleId,
  className,
  size = "default",
  align = "start",
  showHighlight = false,
}: MarketingSectionHeaderProps) {
  const HeadingTag = headingLevel;

  return (
    <header
      className={cx(
        styles.root,
        size === "large" && styles.rootLarge,
        align === "center" && styles.rootCenter,
        size === "large" && align === "start" && styles.rootLargeStart,
        showHighlight && styles.showHighlight,
        className
      )}
    >
      {eyebrow != null && eyebrow !== "" ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <HeadingTag
        {...(titleId ? { id: titleId } : {})}
        className={styles.heading}
      >
        {wrapHyphenatedCompounds(title)}
      </HeadingTag>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}
