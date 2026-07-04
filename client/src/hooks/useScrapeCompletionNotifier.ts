import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  isScrapeJobInFlight,
  scrapeDashboardPath,
  snapshotFromListJob,
} from "@shared/scrapeProgressUi";
import type { ScrapeListJob } from "@/lib/activeScrapeJob";

const TOAST_DURATION_MS = 12_000;

/**
 * Global scrape completion toasts. Mounted once in DashboardLayout so users
 * who navigate away during a spy session get a one-click path back.
 */
export function useScrapeCompletionNotifier() {
  const [, setLocation] = useLocation();
  const statusByJobRef = useRef<Map<number, string>>(new Map());
  const toastedCompletedRef = useRef<Set<number>>(new Set());

  const jobsQuery = trpc.scrape.list.useQuery(undefined, {
    refetchInterval: (q) => {
      const jobs = q.state.data;
      if (!jobs?.some((j) => isScrapeJobInFlight(j.status) && !j.isDemo)) return false;
      return 3000;
    },
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const jobs = jobsQuery.data;
    if (!jobs?.length) return;

    const currentPath =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "";

    for (const job of jobs) {
      if (job.isDemo) continue;

      const prev = statusByJobRef.current.get(job.id);
      statusByJobRef.current.set(job.id, job.status);

      const justCompleted =
        job.status === "completed" &&
        prev !== undefined &&
        prev !== "completed" &&
        !toastedCompletedRef.current.has(job.id);

      if (!justCompleted) continue;

      toastedCompletedRef.current.add(job.id);

      const handle = `@${job.handle.replace(/^@/, "")}`;
      const dashboardPath = scrapeDashboardPath(job.id, "research");
      const alreadyOnDashboard = currentPath.includes(`jobId=${job.id}`);

      if (alreadyOnDashboard) continue;

      toast.success(`${handle} research is ready`, {
        description: `${job.reelsFound || job.totalReels || 0} reels ranked and ready to explore.`,
        duration: TOAST_DURATION_MS,
        action: {
          label: "Open reels",
          onClick: () => setLocation(dashboardPath),
        },
      });
    }
  }, [jobsQuery.data, setLocation]);
}

export function runningJobProgressSnapshot(job: ScrapeListJob) {
  return snapshotFromListJob({
    id: job.id,
    handle: job.handle,
    status: job.status,
    progressPercent: job.progressPercent,
    reelsFound: job.reelsFound,
    currentStep: job.currentStep,
    estimatedTotal: job.estimatedTotal,
    timeframeDays: job.timeframeDays,
  });
}
