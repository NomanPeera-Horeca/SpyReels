import styles from "./MarketingBreadcrumb.module.css";

export type MarketingBreadcrumbItem = {
  label: string;
  /** Omit on the current page (last item). */
  href?: string;
};

export type MarketingBreadcrumbProps = {
  items: readonly MarketingBreadcrumbItem[];
  align?: "center" | "start";
  className?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Marketing / Breadcrumb (Figma 981:2438).
 * Visible trail for marketing pages; pair with BreadcrumbList JSON-LD.
 */
export function MarketingBreadcrumb({
  items,
  align = "start",
  className,
}: MarketingBreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol
        className={cx(
          styles.list,
          "sr-text-marketing-body-small",
          align === "center" ? styles.alignCenter : styles.alignStart
        )}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <span key={`${item.label}-${index}`} className={styles.contents}>
              {index > 0 ? (
                <li className={styles.sep} aria-hidden="true">
                  /
                </li>
              ) : null}
              <li>
                {isLast || !item.href ? (
                  <span className={styles.current} aria-current="page">
                    {item.label}
                  </span>
                ) : (
                  <a className={styles.link} href={item.href}>
                    {item.label}
                  </a>
                )}
              </li>
            </span>
          );
        })}
      </ol>
    </nav>
  );
}
