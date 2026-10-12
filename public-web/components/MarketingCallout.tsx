import styles from "./MarketingCallout.module.css";

export type MarketingCalloutType = "key-point" | "tip" | "note" | "warning";

const TYPE_META: Record<
  MarketingCalloutType,
  { className: string; label: string; defaultTitle: string; defaultBody: string }
> = {
  "key-point": {
    className: styles.keyPoint,
    label: "Key point",
    defaultTitle: "Check your language needs first",
    defaultBody: "If your team needs multilingual scripts, test that before you switch.",
  },
  tip: {
    className: styles.tip,
    label: "Tip",
    defaultTitle: "Check your language needs first",
    defaultBody: "If your team needs multilingual scripts, test that before you switch.",
  },
  note: {
    className: styles.note,
    label: "Note",
    defaultTitle: "Check your language needs first",
    defaultBody: "If your team needs multilingual scripts, test that before you switch.",
  },
  warning: {
    className: styles.warning,
    label: "Warning",
    defaultTitle: "Check your language needs first",
    defaultBody: "If your team needs multilingual scripts, test that before you switch.",
  },
};

/** Figma article instance copy for the pricing verification flag. */
export const PRICING_NOTE_CALLOUT = {
  type: "note" as const,
  title: "Pricing changes often",
  body: "Check each vendor's site before making a decision.",
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function MarketingCallout({
  type,
  title,
  body,
  className,
}: {
  type: MarketingCalloutType;
  title?: string;
  body?: string;
  className?: string;
}) {
  const meta = TYPE_META[type];
  return (
    <aside
      className={cx(styles.root, meta.className, className)}
      data-marketing-callout={type}
    >
      <span className={styles.accent} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.copy}>
          <p className={cx("sr-text-marketing-label", styles.label)}>{meta.label}</p>
          <p className={cx("sr-text-marketing-title-medium", styles.title)}>
            {title ?? meta.defaultTitle}
          </p>
          <p className={cx("sr-text-marketing-body-small", styles.body)}>
            {body ?? meta.defaultBody}
          </p>
        </div>
      </div>
    </aside>
  );
}
