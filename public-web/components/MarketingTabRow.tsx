"use client";

import styles from "./MarketingTabRow.module.css";

export type MarketingTab = {
  id: string;
  label: string;
};

export type MarketingTabRowProps<T extends string = string> = {
  tabs: readonly MarketingTab[];
  active: T;
  onChange: (id: T) => void;
  /** Accessible name for the tablist. */
  "aria-label"?: string;
  className?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Marketing / Tab Row (Figma 983:2460).
 * Centered wrapping row of text tabs for marketing filters.
 */
export function MarketingTabRow<T extends string = string>({
  tabs,
  active,
  onChange,
  "aria-label": ariaLabel = "Categories",
  className,
}: MarketingTabRowProps<T>) {
  return (
    <div
      className={cx(styles.row, className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={cx(styles.tab, "sr-text-product-label")}
          onClick={() => onChange(tab.id as T)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
