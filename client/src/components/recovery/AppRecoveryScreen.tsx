import { getLoginUrl } from "@/const";
import { IconSpinner } from "@/design-system/icons";
import { OnboardingShell } from "@/design-system/OnboardingShell";
import { PrimaryButton } from "@/design-system/core";
import "@/design-system/tokens.css";
import type { RecoveryView } from "@/lib/recovery/classifyServerQuery";
import styles from "./AppRecoveryScreen.module.css";

function signIn() {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.href = getLoginUrl({
    returnTo: returnTo.startsWith("/") ? returnTo : "/onboarding",
  });
}

/**
 * Shared wait / failure / sign-in screen. Uses the onboarding shell and the
 * locked primary button so a recovery state is not a second visual system.
 * Saved data stays on the server; Retry only asks for it again.
 */
export function AppRecoveryScreen({
  view,
  onRetry,
}: {
  view: RecoveryView;
  onRetry?: () => void;
}) {
  const title =
    view.kind === "unauthorized"
      ? "Your session expired"
      : view.kind === "error"
        ? "We couldn't load your saved progress"
        : "Restoring your progress";
  const detail =
    view.kind === "unauthorized"
      ? "Sign in to continue where you left off. Your answers stay saved."
      : view.kind === "error"
        ? "Your answers are still saved. Try again."
        : "Your saved answers will appear in a moment.";

  const action =
    view.kind === "unauthorized" ? (
      <PrimaryButton onClick={signIn}>Sign in</PrimaryButton>
    ) : view.kind === "error" && onRetry ? (
      <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
    ) : null;

  return (
    <OnboardingShell
      testId="app-recovery"
      actions={action ? <div className={styles.actions}>{action}</div> : <span />}
      mobileActions={action ? <div className={styles.actions}>{action}</div> : <span />}
    >
      <div
        className={styles.stack}
        role={view.kind === "loading" ? "status" : "alert"}
        aria-live="polite"
        aria-busy={view.kind === "loading"}
      >
        {view.kind === "loading" ? <IconSpinner className={styles.spin} /> : null}
        <h1 className={["sr-text-product-heading-1", styles.title].join(" ")}>{title}</h1>
        <p className={["sr-text-product-body-large", styles.detail].join(" ")}>{detail}</p>
      </div>
    </OnboardingShell>
  );
}
