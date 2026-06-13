import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type ScrapeStartResult = inferRouterOutputs<AppRouter>["scrape"]["start"];

export function navigateAfterScrapeStart(
  data: ScrapeStartResult,
  setLocation: (to: string) => void,
  from: string
): void {
  if ("seededFromFeatured" in data && data.seededFromFeatured) {
    setLocation(`/dashboard?jobId=${data.jobId}&from=${from}`);
    return;
  }
  setLocation(`/scraping?jobId=${data.jobId}&from=${from}`);
}
