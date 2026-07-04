import { useLocation } from "wouter";
import type { ScrapeListJob } from "@/lib/activeScrapeJob";
import {
  ScrapeJobProgressUI,
  openScrapeDashboard,
} from "@/components/ScrapeJobProgressUI";
import { runningJobProgressSnapshot } from "@/hooks/useScrapeCompletionNotifier";

type ActiveScrapeJobNoticeProps = {
  job: ScrapeListJob;
  variant?: "banner" | "sidebar";
};

export function ActiveScrapeJobNotice({
  job,
  variant = "banner",
}: ActiveScrapeJobNoticeProps) {
  const [, setLocation] = useLocation();
  const snapshot = runningJobProgressSnapshot(job);

  return (
    <ScrapeJobProgressUI
      snapshot={snapshot}
      variant={variant}
      className={variant === "banner" ? "mb-5" : undefined}
      onOpen={() => openScrapeDashboard(setLocation, job.id, "research")}
    />
  );
}
