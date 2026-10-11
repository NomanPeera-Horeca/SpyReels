import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

export type MarketingSectionPair = "start" | "end";

type MarketingSectionProps<T extends ElementType = "section"> = {
  as?: T;
  children: ReactNode;
  className?: string;
  /** Pair with the adjacent section using one paired-gap (Decision 31). */
  pair?: MarketingSectionPair;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

/**
 * Shared marketing section shell.
 * padding-block = section-gap (64) at every width (see app/marketing-section.css).
 * Paired sections: end keeps paired-gap bottom; start has padding-top 0.
 */
export function MarketingSection<T extends ElementType = "section">({
  as,
  children,
  className,
  pair,
  ...rest
}: MarketingSectionProps<T>) {
  const Tag = (as ?? "section") as ElementType;
  return (
    <Tag
      className={className}
      data-marketing-section=""
      data-marketing-section-pair={pair || undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
