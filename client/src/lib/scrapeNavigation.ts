import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type ScrapeStartResult = inferRouterOutputs<AppRouter>["scrape"]["start"];

export function navigateAfterScrapeStart(
  data: ScrapeStartResult,
  setLocation: (to: string) => void,
  from: string
): void {
  if ("redirect" in data && data.redirect === "featured") {
    setLocation(
      `/dashboard?featuredAccountId=${data.featuredAccountId}&from=${from}`
    );
    return;
  }
  setLocation(`/scraping?jobId=${data.jobId}&from=${from}`);
}
