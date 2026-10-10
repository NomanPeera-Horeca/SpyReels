import type { ComponentType, SVGProps } from "react";
import { MarketingSectionHeader } from "./MarketingSectionHeader";
import {
  MarketingIconCheck,
  MarketingIconProcessResearch,
  MarketingIconToolFinder,
} from "./MarketingIcons";
import styles from "./MarketingResponsibleResearch.module.css";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type ResearchCard = {
  title: string;
  body: string;
  icon: IconComponent;
};

const CARDS: readonly [ResearchCard, ResearchCard, ResearchCard] = [
  {
    title: "Pattern intelligence, not copying",
    body: "Study hooks, formats, topics, and performance patterns, then create something suited to your own audience.",
    icon: MarketingIconProcessResearch,
  },
  {
    title: "Public-content research",
    body: "Creator discovery is designed around publicly available content signals.",
    icon: MarketingIconToolFinder,
  },
  {
    title: "You stay in control",
    body: "Review, rewrite, and approve every idea before anything is published.",
    icon: MarketingIconCheck,
  },
];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Marketing / Responsible Research (Figma Page 09).
 * Large/Start header + Body Medium intro; one wide card + two below.
 */
export function MarketingResponsibleResearch() {
  const titleId = "responsible-research-title";
  const [wide, ...rest] = CARDS;
  const WideIcon = wide.icon;

  return (
    <section
      className={styles.section}
      id="responsible-research"
      aria-labelledby={titleId}
      data-marketing-responsible-research=""
    >
      <div className={styles.shell}>
        <MarketingSectionHeader
          className={styles.header}
          title={
            <>
              Use performance signals.
              <br />
              Make original work.
            </>
          }
          subtitle="SpyReels helps creators understand public content patterns while keeping judgment, voice, and publishing decisions in their hands."
          headingLevel="h2"
          titleId={titleId}
          size="large"
          align="start"
        />

        <div className={styles.cards}>
          <article className={styles.card}>
            <span className={styles.iconTile} aria-hidden="true">
              <WideIcon />
            </span>
            <div className={styles.copy}>
              <h3 className={cx("sr-text-marketing-title-medium", styles.cardTitle)}>{wide.title}</h3>
              <p className={cx("sr-text-marketing-body-small", styles.cardBody)}>{wide.body}</p>
            </div>
          </article>

          <div className={styles.bottomRow}>
            {rest.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className={styles.card}>
                  <span className={styles.iconTile} aria-hidden="true">
                    <Icon />
                  </span>
                  <div className={styles.copy}>
                    <h3 className={cx("sr-text-marketing-title-medium", styles.cardTitle)}>
                      {card.title}
                    </h3>
                    <p className={cx("sr-text-marketing-body-small", styles.cardBody)}>{card.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
