import type { PersonalizationStep } from "@shared/personalization/model";
import { IconToolCarousel, IconToolCreators, IconToolScript } from "./icons";
import styles from "./PersonalizationStepper.module.css";

/**
 * Pattern / Personalization Stepper v2 (Figma 1274:1444, approved 2026-10-13).
 * Bars: brand for done and current, subtle for upcoming. Current label brand
 * semibold, done primary, upcoming tertiary. Each step is clickable.
 */
const STEPS: Array<{ key: PersonalizationStep; label: string; Icon: typeof IconToolScript }> = [
  { key: "goal", label: "Goal", Icon: IconToolScript },
  { key: "audience", label: "Audience", Icon: IconToolCreators },
  { key: "pillars", label: "Pillars", Icon: IconToolCarousel },
];

export function PersonalizationStepper({
  current,
  onSelect,
}: {
  current: PersonalizationStep;
  onSelect: (step: PersonalizationStep) => void;
}) {
  const currentIndex = STEPS.findIndex(s => s.key === current);
  return (
    <nav className={styles.root} aria-label="Personalization steps">
      {STEPS.map(({ key, label, Icon }, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <button
            key={key}
            type="button"
            className={styles.step}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            onClick={() => onSelect(key)}
          >
            <span className={styles.bar} />
            <span className={styles.label}>
              <Icon size={16} />
              <span className={state === "current" ? styles.currentText : styles.text}>{label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
