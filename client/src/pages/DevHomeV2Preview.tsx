/**
 * DEV ONLY (routed only when import.meta.env.DEV). Renders the REAL Home v2
 * page with a fixture tRPC link, for visual QA against Figma. All data here
 * is clearly sample data; nothing reaches the server.
 *
 * /dev/home-v2?state=A|B|C|loading|error
 *   A = personalization complete, B = incomplete (banner, general picks),
 *   C = no plan yet, loading = every section loading, error = every section failed.
 */
import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import HomeV2Page from "@/components/home-v2/HomeV2Page";

type State = "A" | "B" | "C" | "loading" | "error";

const badge = (tier: string, multiple: number) => ({ tier, multiple, label: `${tier} · ${multiple}x followers` });

function fixture(path: string, state: State): unknown {
  const complete = state === "A" || state === "C";
  switch (path) {
    case "auth.me":
      return { id: 1, name: "Sample User", email: "sample@example.com", role: "user" };
    case "onboardingV2.experience":
      return { onboarding: "v2", home: "v2", internal: true };
    case "homeV2.context":
      return {
        hasProfile: true,
        nicheLabel: complete ? "Sample niche" : null,
        featuredNicheSlug: complete ? "restaurants-cafes" : null,
        description: complete ? "Sample niche" : null,
        personalizationComplete: complete,
        nextStep: complete ? null : "audience",
      };
    case "plan.listCards": {
      const cards =
        state === "C"
          ? []
          : [
              { id: 1, day: 1, title: "Sample idea one", hook: "Sample hook line for visual QA.", angle: "", status: "planned", coachScriptId: null },
              { id: 2, day: 2, title: "Sample idea two", hook: "Another sample hook, not real data.", angle: "", status: "planned", coachScriptId: null },
            ];
      return { cards, sparkCards: [], calendarCards: cards };
    }
    case "homeV2.creators":
      return {
        personalized: complete,
        nicheLabel: complete ? "Sample niche" : null,
        creators: [
          { id: 1, handle: "sample.creator", displayName: "Sample Creator", profilePicUrl: null, followerCount: 1000, platform: "instagram", badge: badge("Strong", 34) },
          { id: 2, handle: "a.very.long.sample.creator.handle", displayName: "A Very Long Sample Creator Name For Truncation", profilePicUrl: null, followerCount: 1000, platform: "instagram", badge: badge("Viral", 130) },
          { id: 3, handle: "third.sample", displayName: "Third Sample", profilePicUrl: null, followerCount: 1000, platform: "instagram", badge: null },
        ],
      };
    case "homeV2.videos":
      return {
        personalized: complete,
        nicheLabel: complete ? "Sample niche" : null,
        items: [
          { id: "1", sourceId: "s1", platform: "instagram", creatorName: "Sample", creatorHandle: "sample_one", creatorFollowers: 1000, sourceUrl: "https://example.com/1", thumbnailUrl: null, hook: "Sample video title for QA", views: 34_000, trendStatus: "stable", relevanceLabel: "", relevanceReason: "", saved: false, dismissed: false, remade: false },
          { id: "2", sourceId: "s2", platform: "tiktok", creatorName: "Sample", creatorHandle: "sample_two", creatorFollowers: 2000, sourceUrl: "https://example.com/2", thumbnailUrl: null, hook: "Second sample video title", views: 260_000, trendStatus: "stable", relevanceLabel: "", relevanceReason: "", saved: true, dismissed: false, remade: false },
        ],
      };
    case "homeV2.profiles":
      return [
        { id: "p1", platform: "instagram", handle: "yourhandle", displayName: null, status: "active", active: true },
      ];
    default:
      return null;
  }
}

function fixtureLink(state: State): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable(observer => {
        if (state === "loading" && op.path !== "auth.me" && op.path !== "onboardingV2.experience") return () => undefined;
        if (state === "error" && op.path !== "auth.me" && op.path !== "onboardingV2.experience" && op.path !== "homeV2.context") {
          observer.error(TRPCClientError.from(new Error("fixture error")));
          return () => undefined;
        }
        observer.next({ result: { type: "data", data: fixture(op.path, state) } });
        observer.complete();
        return () => undefined;
      });
}

export default function DevHomeV2Preview() {
  const state = (new URLSearchParams(useSearch()).get("state") ?? "A") as State;
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const client = useMemo(() => trpc.createClient({ links: [fixtureLink(state)] }), [state]);
  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <HomeV2Page />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
