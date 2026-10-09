import type { ReactNode } from "react";
import styles from "./MarketingSectionHeader.module.css";

export type MarketingSectionHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Semantic heading level for the section title */
  headingLevel?: "h2" | "h3" | "h4";
  titleId?: string;
  className?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Marketing / Section Header — eyebrow, Heading 3, optional Body Small subtitle.
 */
export function MarketingSectionHeader({
  eyebrow,
  title,
  subtitle,
  headingLevel = "h2",
  titleId,
  className,
}: MarketingSectionHeaderProps) {
  const HeadingTag = headingLevel;

  return (
    <header className={cx(styles.root, className)}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <HeadingTag
        {...(titleId ? { id: titleId } : {})}
        className={styles.heading}
      >
        {title}
      </HeadingTag>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}
