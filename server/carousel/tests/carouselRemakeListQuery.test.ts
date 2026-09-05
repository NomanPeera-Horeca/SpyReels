import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carouselRemakes } from "../../../drizzle/schema";
import {
  applyCarouselRemakeListWindow,
  carouselRemakeListSqlOrderBy,
  planCarouselRemakeListQuery,
} from "../carouselRemakeListQuery";

function remake(id: number, createdAt: string, postDate: string | null) {
  return {
    id,
    createdAt: new Date(createdAt),
    postDate: postDate ? new Date(postDate) : null,
  };
}

describe("planCarouselRemakeListQuery", () => {
  it("defaults omitted sort to scheduled-first after a createdAt DESC window", () => {
    expect(planCarouselRemakeListQuery()).toEqual({
      sort: "scheduled",
      sqlOrderBy: "createdAt_desc",
      limit: 20,
      applyScheduledFirstSort: true,
    });
    expect(planCarouselRemakeListQuery({ limit: 20 })).toEqual({
      sort: "scheduled",
      sqlOrderBy: "createdAt_desc",
      limit: 20,
      applyScheduledFirstSort: true,
    });
    expect(planCarouselRemakeListQuery({ sort: "scheduled", limit: 20 })).toEqual({
      sort: "scheduled",
      sqlOrderBy: "createdAt_desc",
      limit: 20,
      applyScheduledFirstSort: true,
    });
  });

  it("uses createdAt DESC before LIMIT and skips scheduled-first when sort is newest", () => {
    const plan = planCarouselRemakeListQuery({ sort: "newest", limit: 50 });
    expect(plan.sqlOrderBy).toBe("createdAt_desc");
    expect(plan.applyScheduledFirstSort).toBe(false);
    expect(plan.limit).toBe(50);
    expect(plan.sort).toBe("newest");
  });
});

function sqlOrderText(clause: { queryChunks: unknown[] }): string {
  return clause.queryChunks
    .map((chunk) => {
      if (chunk === carouselRemakes.createdAt) return "carousel_remakes.createdAt";
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        const value = (chunk as { value: string | string[] }).value;
        return Array.isArray(value) ? value.join("") : String(value);
      }
      return "";
    })
    .join("");
}

describe("carouselRemakeListSqlOrderBy", () => {
  it("orders by carousel_remakes.createdAt DESC for both sort modes", () => {
    const newest = carouselRemakeListSqlOrderBy("newest");
    const scheduled = carouselRemakeListSqlOrderBy("scheduled");
    expect(newest.queryChunks).toContain(carouselRemakes.createdAt);
    expect(scheduled.queryChunks).toContain(carouselRemakes.createdAt);
    expect(sqlOrderText(newest).toLowerCase()).toContain("carousel_remakes.createdat");
    expect(sqlOrderText(newest).toLowerCase()).toContain("desc");
    expect(sqlOrderText(scheduled).toLowerCase()).toBe(sqlOrderText(newest).toLowerCase());
  });
});

describe("applyCarouselRemakeListWindow", () => {
  it("keeps newer unscheduled remakes when newest ordering runs before LIMIT", () => {
    const rows = [
      remake(1, "2026-01-01T00:00:00.000Z", "2026-09-01"),
      remake(2, "2026-01-02T00:00:00.000Z", "2026-09-02"),
      remake(3, "2026-08-20T00:00:00.000Z", null),
      remake(4, "2026-08-25T00:00:00.000Z", null),
      remake(5, "2026-08-31T00:00:00.000Z", null),
    ];

    const newest = applyCarouselRemakeListWindow(rows, {
      sort: "newest",
      limit: 3,
    });
    expect(newest.map((row) => row.id)).toEqual([5, 4, 3]);
    expect(newest.every((row) => row.postDate === null)).toBe(true);
  });

  it("keeps scheduled-first after the createdAt window for default callers", () => {
    const rows = [
      remake(1, "2026-08-31T00:00:00.000Z", null),
      remake(2, "2026-08-30T00:00:00.000Z", "2026-09-10"),
      remake(3, "2026-08-29T00:00:00.000Z", "2026-09-01"),
      remake(4, "2026-01-01T00:00:00.000Z", "2026-08-01"),
    ];

    const omitted = applyCarouselRemakeListWindow(rows, { limit: 3 });
    const scheduled = applyCarouselRemakeListWindow(rows, {
      sort: "scheduled",
      limit: 3,
    });

    expect(omitted.map((row) => row.id)).toEqual([3, 2, 1]);
    expect(scheduled.map((row) => row.id)).toEqual([3, 2, 1]);
    expect(omitted[0].postDate).not.toBeNull();
    expect(omitted.map((row) => row.id)).not.toContain(4);
  });

  it("does not drop newer unscheduled remakes that scheduled-first-then-limit would hide", () => {
    const scheduledOld = Array.from({ length: 4 }, (_, i) =>
      remake(i + 1, `2026-01-0${i + 1}T00:00:00.000Z`, `2026-09-0${i + 1}`)
    );
    const newestUnscheduled = [
      remake(10, "2026-08-28T00:00:00.000Z", null),
      remake(11, "2026-08-29T00:00:00.000Z", null),
      remake(12, "2026-08-30T00:00:00.000Z", null),
    ];
    const rows = [...scheduledOld, ...newestUnscheduled];

    const newest = applyCarouselRemakeListWindow(rows, {
      sort: "newest",
      limit: 3,
    });
    expect(newest.map((row) => row.id)).toEqual([12, 11, 10]);

    const scheduled = applyCarouselRemakeListWindow(rows, {
      sort: "scheduled",
      limit: 3,
    });
    // Window is still createdAt DESC then LIMIT; scheduled-first only reorders that window.
    expect(scheduled.map((row) => row.id)).toEqual([12, 11, 10]);
  });
});

describe("carouselRemake.list callers", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const remakeRouter = readFileSync(
    join(here, "../../routers/carouselRemakeRouter.ts"),
    "utf8"
  );
  const studioApp = readFileSync(
    join(here, "../../../client/src/components/carousel-studio/CarouselStudioApp.tsx"),
    "utf8"
  );
  const libraryPage = readFileSync(
    join(here, "../../../client/src/pages/CarouselLibrary.tsx"),
    "utf8"
  );

  it("applies the query plan orderBy before LIMIT in the list procedure", () => {
    expect(remakeRouter).toContain("planCarouselRemakeListQuery");
    expect(remakeRouter).toContain("carouselRemakeListSqlOrderBy(plan.sort)");
    expect(remakeRouter).toMatch(/\.orderBy\(carouselRemakeListSqlOrderBy\(plan\.sort\)\)\s*\n\s*\.limit\(plan\.limit\)/);
    expect(remakeRouter).toContain('sort: z.enum(["scheduled", "newest"]).optional()');
    expect(remakeRouter).toMatch(
      /if \(plan\.applyScheduledFirstSort\) \{\s*return mapped\.sort\(compareRemakesForList\);/
    );
  });

  it("keeps Carousel Library on the default scheduled-first caller", () => {
    expect(libraryPage).toContain("trpc.carouselRemake.list.useQuery({ limit: 20 })");
    expect(libraryPage).not.toContain('sort: "newest"');
  });

  it("has the Carousels hub request newest ordering for Recent", () => {
    const hubPage = readFileSync(
      join(here, "../../../client/src/pages/Carousels.tsx"),
      "utf8"
    );
    expect(hubPage).toContain('sort: "newest"');
    expect(studioApp).not.toContain("STUDIO_LIBRARY_LIST_QUERY");
  });
});
