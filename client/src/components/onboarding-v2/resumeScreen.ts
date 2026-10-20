import type { OnboardingStep } from "@shared/personalization/model";

export type ResumeScreen =
  | "platform"
  | "use_case"
  | "attribution"
  | "goal"
  | "audience"
  | "pillars";

/** The screen for a saved step. "done" means onboarding is already finished. */
export function screenFromResume(step: OnboardingStep): ResumeScreen | "done" {
  switch (step) {
    case "platform":
    case "profile_confirm":
      return "platform";
    case "use_case":
    case "attribution":
    case "goal":
    case "audience":
    case "pillars":
      return step;
    case "done":
      return "done";
  }
}
