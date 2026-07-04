import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { isScrapeJobInFlight } from "@shared/scrapeProgressUi";

export type ScrapeListJob = inferRouterOutputs<AppRouter>["scrape"]["list"][number];

export function pickActiveRunningScrapeJob(
  jobs: ScrapeListJob[] | undefined
): ScrapeListJob | null {
  if (!jobs?.length) return null;
  const running = jobs.filter((j) => isScrapeJobInFlight(j.status) && !j.isDemo);
  if (running.length === 0) return null;
  return [...running].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
}

export function listHasRunningScrapeJob(jobs: ScrapeListJob[] | undefined): boolean {
  return pickActiveRunningScrapeJob(jobs) != null;
}

export function useActiveScrapeJob() {
  const query = trpc.scrape.list.useQuery(undefined, {
    refetchInterval: (q) => {
      const jobs = q.state.data;
      if (!listHasRunningScrapeJob(jobs)) return false;
      return 3000;
    },
    refetchOnWindowFocus: true,
  });

  const activeJob = useMemo(
    () => pickActiveRunningScrapeJob(query.data),
    [query.data]
  );

  return { activeJob, isLoading: query.isLoading, jobs: query.data };
}
