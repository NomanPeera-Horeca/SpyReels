import type { ComponentType, ReactNode, SVGProps } from "react";
import { Fragment } from "react";
import { MarketingSection } from "./MarketingSection";
import { MarketingSectionHeader } from "./MarketingSectionHeader";
import {
  MarketingIconArrowRight,
  MarketingIconProcessFilm,
  MarketingIconProcessRemake,
  MarketingIconProcessResearch,
} from "./MarketingIcons";
import styles from "./MarketingProcessSteps.module.css";

export type MarketingProcessStep = {
  number: string;
  title: string;
  body: string;
  /** Required when presentation="icon". */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

export type MarketingProcessStepsPresentation = "numbered" | "icon";

export type MarketingProcessStepsProps = {
  presentation: MarketingProcessStepsPresentation;
  title: ReactNode;
  subtitle?: ReactNode;
  steps: readonly [MarketingProcessStep, MarketingProcessStep, MarketingProcessStep];
  id?: string;
  className?: string;
  /** Numbered default eyebrow. Ignored for icon presentation. */
  eyebrow?: ReactNode;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Marketing / Process Steps (Figma Page 09).
 * numbered: finder How it works. icon: homepage Research / Remake / Film.
 */
export function MarketingProcessSteps({
  presentation,
  title,
  subtitle,
  steps,
  id = presentation === "numbered" ? "how-it-works" : "tools",
  className,
  eyebrow = "How it works",
}: MarketingProcessStepsProps) {
  const titleId = `${id}-title`;
  const isIcon = presentation === "icon";

  return (
    <MarketingSection
      id={id}
      className={cx(styles.section, className)}
      aria-labelledby={titleId}
      data-marketing-process-steps={presentation}
    >
      <div className={cx(styles.shell, isIcon && styles.shellIcon)}>
        <MarketingSectionHeader
          className={isIcon ? styles.headerIcon : styles.headerNumbered}
          eyebrow={isIcon ? undefined : eyebrow}
          title={title}
          subtitle={subtitle}
          headingLevel="h2"
          titleId={titleId}
          size="large"
          align={isIcon ? "center" : "start"}
          showHighlight={isIcon}
        />

        <div
          className={cx(styles.steps, isIcon && styles.stepsIcon)}
          aria-label={isIcon ? "Research, Remake, Film" : undefined}
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Fragment key={step.number}>
                {isIcon && index > 0 ? (
                  <span className={styles.connector} aria-hidden="true">
                    <MarketingIconArrowRight />
                  </span>
                ) : null}
                <article className={cx(styles.card, isIcon && styles.cardIcon)}>
                  <div className={styles.headerBlock}>
                    {isIcon ? (
                      <div className={styles.topRow}>
                        <span className={styles.iconTile} aria-hidden="true">
                          {Icon ? <Icon /> : null}
                        </span>
                        <span className={cx("sr-text-marketing-label", styles.number, styles.numberIcon)}>
                          {step.number}
                        </span>
                      </div>
                    ) : (
                      <span className={cx("sr-text-marketing-label", styles.number)}>{step.number}</span>
                    )}
                    <h3 className={cx("sr-text-marketing-heading-4", styles.cardTitle)}>{step.title}</h3>
                  </div>
                  <p className={cx("sr-text-marketing-body-medium", styles.cardBody)}>{step.body}</p>
                </article>
              </Fragment>
            );
          })}
        </div>
      </div>
    </MarketingSection>
  );
}

export const MARKETING_PROCESS_ICON_STEPS = {
  research: MarketingIconProcessResearch,
  remake: MarketingIconProcessRemake,
  film: MarketingIconProcessFilm,
} as const;
