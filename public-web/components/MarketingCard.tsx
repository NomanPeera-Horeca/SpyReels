import type { HTMLAttributes, ReactNode } from "react";
import styles from "./MarketingCard.module.css";

export type MarketingCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  /** Flat default; Raised only for a genuine floating surface. */
  elevation?: "flat" | "raised";
  as?: "article" | "div" | "li" | "section";
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Card / Static (Figma 52:31). Non-interactive content grouping surface. */
export function MarketingCard({
  children,
  elevation = "flat",
  as: Tag = "div",
  className,
  ...rest
}: MarketingCardProps) {
  return (
    <Tag
      className={cx(styles.root, elevation === "raised" && styles.raised, className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
