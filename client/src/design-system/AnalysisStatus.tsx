/**
 * Status / Analysis Line (1259:518), Status / Analysis Stage (1259:489) and
 * Pattern / Analysis Status Checklist (1260:1494). All approved 2026-10-13.
 *
 * Every state here must come from the real backend job. These components
 * have no timers, percentages or progress bars, and they never advance a
 * stage on their own.
 */
import type {
  AnalysisRunStatus,
  AnalysisStageStatus,
} from "@shared/personalization/model";
import { IconCheck, IconError, IconMinus, IconSpinner } from "./icons";
import styles from "./AnalysisStatus.module.css";

function StageIndicator({ status }: { status: AnalysisStageStatus | "queued" }) {
  switch (status) {
    case "running":
      return <IconSpinner className={styles.spin} />;
    case "done":
      return <IconCheck />;
    case "failed":
      return <IconError />;
    case "skipped":
      return <IconMinus />;
    default:
      return <span className={styles.pendingRing} />;
  }
}

const LINE_LABEL: Record<AnalysisRunStatus, string> = {
  queued: "Waiting to analyze",
  running: "Analyzing",
  succeeded: "Analysis complete for",
  partial: "Some insights are unavailable for",
  failed: "We couldn't analyze",
};

export function AnalysisStatusLine({
  status,
  handle,
  className,
}: {
  status: AnalysisRunStatus;
  /** Shown exactly as the user typed it, with a leading @. */
  handle: string;
  className?: string;
}) {
  const indicator =
    status === "running" ? (
      <IconSpinner className={styles.spin} />
    ) : status === "succeeded" ? (
      <IconCheck />
    ) : status === "partial" ? (
      <IconError tone="warning" />
    ) : status === "failed" ? (
      <IconError />
    ) : (
      <span className={styles.pendingRing} />
    );
  return (
    <div
      className={[styles.line, className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className={styles.indicator}>{indicator}</span>
      <span className={["sr-text-product-body-small", styles.lineText].join(" ")}>
        <span>{LINE_LABEL[status]}</span>
        <span>{handle}</span>
      </span>
    </div>
  );
}

export type AnalysisStageView = {
  key: string;
  title: string;
  description: string;
  status: AnalysisStageStatus;
};

export function AnalysisStage({ stage }: { stage: AnalysisStageView }) {
  const muted = stage.status === "waiting";
  const label =
    stage.status === "failed"
      ? "Failed"
      : stage.status === "skipped"
        ? "Unavailable"
        : null;
  return (
    <li className={styles.stage} data-status={stage.status}>
      <span className={styles.indicator}>
        <StageIndicator status={stage.status} />
      </span>
      <span className={styles.stageText}>
        <span className={styles.titleRow}>
          <span
            className={[
              "sr-text-product-label",
              muted ? styles.textTertiary : styles.textPrimary,
            ].join(" ")}
          >
            {stage.title}
          </span>
          {label ? (
            <span
              className={[
                "sr-text-product-caption",
                stage.status === "failed" ? styles.textError : styles.textTertiary,
              ].join(" ")}
            >
              {label}
            </span>
          ) : null}
        </span>
        <span
          className={[
            "sr-text-product-caption",
            muted ? styles.textTertiary : styles.textSecondary,
          ].join(" ")}
        >
          {stage.description}
        </span>
      </span>
    </li>
  );
}

export function AnalysisStatusChecklist({
  heading = "We're learning what helps your content grow",
  stages,
  statusLine,
  className,
}: {
  heading?: string;
  stages: AnalysisStageView[];
  /** Hidden in onboarding, which shows the line on the left already. */
  statusLine?: { status: AnalysisRunStatus; handle: string } | null;
  className?: string;
}) {
  return (
    <section
      className={[styles.checklist, className].filter(Boolean).join(" ")}
      aria-label={heading}
    >
      {statusLine ? (
        <AnalysisStatusLine status={statusLine.status} handle={statusLine.handle} />
      ) : null}
      <h2 className={["sr-text-product-heading-4", styles.textPrimary].join(" ")}>
        {heading}
      </h2>
      <ol className={styles.stages}>
        {stages.map(stage => (
          <AnalysisStage key={stage.key} stage={stage} />
        ))}
      </ol>
    </section>
  );
}
