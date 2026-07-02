import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type ScrapeListJob = inferRouterOutputs<AppRouter>["scrape"]["list"][number];

export function pickActiveRunningScrapeJob(
  jobs: ScrapeListJob[] | undefined
): ScrapeListJob | null {
  if (!jobs?.length) return null;
  const running = jobs.filter((j) => j.status === "running" && !j.isDemo);
  if (running.length === 0) return null;
  return [...running].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
}

export function useActiveScrapeJob() {
  const query = trpc.scrape.list.useQuery(undefined, {
    refetchInterval: (q) => {
      const jobs = q.state.data;
      if (!jobs) return false;
      return jobs.some((j) => j.status === "running" && !j.isDemo) ? 3000 : false;
    },
    refetchOnWindowFocus: true,
  });

  const activeJob = useMemo(
    () => pickActiveRunningScrapeJob(query.data),
    [query.data]
  );

  return { activeJob, isLoading: query.isLoading };
}
