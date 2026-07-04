import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { navigateAppReplace } from "@shared/appNavigation";
import {
  scrapeDashboardPath,
  shouldOpenDashboardEarly,
} from "@shared/scrapeProgressUi";

export type ScrapeStartResult = inferRouterOutputs<AppRouter>["scrape"]["start"];

export function navigateAfterScrapeStart(
  data: ScrapeStartResult,
  setLocation: (to: string) => void,
  from: string
): void {
  if ("seededFromFeatured" in data && data.seededFromFeatured) {
    setLocation(scrapeDashboardPath(data.jobId, from));
    return;
  }
  setLocation(`/scraping?jobId=${data.jobId}&from=${from}`);
}

export function navigateWhenReelsReady(args: {
  jobId: number;
  reelsFound: number;
  from: string;
  setLocation: (to: string, options?: { replace?: boolean }) => void;
  replace?: boolean;
}): boolean {
  if (!shouldOpenDashboardEarly(args.reelsFound)) return false;
  const path = scrapeDashboardPath(args.jobId, args.from);
  if (args.replace) {
    navigateAppReplace(args.setLocation, path);
  } else {
    args.setLocation(path);
  }
  return true;
}

export { scrapeDashboardPath, shouldOpenDashboardEarly };
