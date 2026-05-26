export type OutreachSegment =
  | "canceled_paid"
  | "at_risk_paid"
  | "engaged_free"
  | "active_free"
  | "ghost"
  | "bug_hit";

export const SEGMENT_SORT_ORDER: Record<OutreachSegment, number> = {
  canceled_paid: 0,
  at_risk_paid: 1,
  engaged_free: 2,
  active_free: 3,
  ghost: 4,
  bug_hit: 5,
};

export function computeRetentionStatus(
  lastSignedIn: Date,
  now = new Date()
): "active" | "at_risk" | "churned" {
  const daysSinceActive = Math.floor(
    (now.getTime() - lastSignedIn.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceActive > 30) return "churned";
  if (daysSinceActive > 7) return "at_risk";
  return "active";
}

export function computeSegment(input: {
  plan: string;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  retentionStatus: "active" | "at_risk" | "churned";
  scrapeJobsRun: number;
  scriptsCreated: number;
  reelsCollected: number;
  recentFailedScrape: boolean;
}): OutreachSegment {
  const paidPlan = input.plan !== "free";
  const isCanceled =
    input.subscriptionStatus === "canceled" ||
    input.cancelAtPeriodEnd ||
    (paidPlan && input.retentionStatus === "churned");

  if (input.recentFailedScrape) {
    return "bug_hit";
  }

  if (paidPlan && isCanceled) {
    return "canceled_paid";
  }

  if (paidPlan && input.retentionStatus === "at_risk" && input.subscriptionStatus === "active") {
    return "at_risk_paid";
  }

  const isGhost =
    input.scrapeJobsRun === 0 &&
    input.scriptsCreated === 0 &&
    input.reelsCollected === 0;

  if (isGhost) {
    return "ghost";
  }

  if (input.plan === "free" && (input.scrapeJobsRun >= 2 || input.scriptsCreated >= 2)) {
    return "engaged_free";
  }

  return "active_free";
}

export function buildBehaviorNotes(input: {
  scrapeJobsRun: number;
  scriptsCreated: number;
  reelsCollected: number;
  daysSinceActive: number;
  recentFailedReason: string | null;
  utmSource: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`${input.scrapeJobsRun} scrape jobs, ${input.scriptsCreated} saved scripts`);
  if (input.reelsCollected > 0) {
    parts.push(`${input.reelsCollected} collected reels`);
  }
  parts.push(`Last active ${input.daysSinceActive} days ago`);
  if (input.utmSource) {
    parts.push(`Arrived via ${input.utmSource}`);
  }
  if (input.recentFailedReason) {
    parts.push(`Recent scrape issue: ${input.recentFailedReason}`);
  }
  return parts.join(". ");
}
