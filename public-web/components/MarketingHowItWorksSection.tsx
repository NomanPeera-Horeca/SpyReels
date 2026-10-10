import type { ReactNode } from "react";
import {
  MarketingProcessSteps,
  type MarketingProcessStep,
} from "./MarketingProcessSteps";

/** @deprecated Prefer MarketingProcessStep — kept for finder page imports. */
export type MarketingHowItWorksStep = MarketingProcessStep;

type MarketingHowItWorksSectionProps = {
  /** Section title (page-specific) */
  title: ReactNode;
  /** Optional lead under the title (TikTok uses this; IG omits) */
  description?: ReactNode;
  steps: readonly [MarketingProcessStep, MarketingProcessStep, MarketingProcessStep];
  id?: string;
  /** Scroll-margin / page-specific class on the section */
  className?: string;
};

/**
 * Finder "How it works" — Marketing Process Steps, presentation=numbered.
 */
export function MarketingHowItWorksSection({
  title,
  description,
  steps,
  id = "how-it-works",
  className,
}: MarketingHowItWorksSectionProps) {
  return (
    <MarketingProcessSteps
      presentation="numbered"
      title={title}
      subtitle={description}
      steps={steps}
      id={id}
      className={className}
    />
  );
}
