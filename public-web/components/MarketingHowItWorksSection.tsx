import type { ReactNode } from "react";
import { MarketingSectionHeader } from "./MarketingSectionHeader";
import styles from "./MarketingHowItWorksSection.module.css";

export type MarketingHowItWorksStep = {
  number: string;
  title: string;
  body: string;
};

type MarketingHowItWorksSectionProps = {
  /** Section title (page-specific) */
  title: ReactNode;
  /** Optional lead under the title (TikTok uses this; IG omits) */
  description?: ReactNode;
  steps: readonly [MarketingHowItWorksStep, MarketingHowItWorksStep, MarketingHowItWorksStep];
  id?: string;
  /** Page shell width/gutter class (e.g. page module `.shell`) */
  className?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function MarketingHowItWorksSection({
  title,
  description,
  steps,
  id = "how-it-works",
  className,
}: MarketingHowItWorksSectionProps) {
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      className={cx(styles.root, className)}
      aria-labelledby={titleId}
    >
      <MarketingSectionHeader
        className={styles.header}
        eyebrow="How it works"
        title={title}
        subtitle={description}
        headingLevel="h2"
        titleId={titleId}
      />
      <div className={styles.grid}>
        {steps.map((step) => (
          <article key={step.number} className={styles.card}>
            <span className={styles.number}>{step.number}</span>
            <h3 className={styles.cardTitle}>{step.title}</h3>
            <p className={styles.cardBody}>{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
