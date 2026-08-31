import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDIO_LIBRARY_LIST_QUERY,
  STUDIO_NAV_ITEMS,
  commandForLibraryCard,
  libraryOpenStartsGeneration,
  mapStudioLibraryRows,
  studioLibraryCardMeta,
} from "./studioLibrary";

describe("STUDIO_LIBRARY_LIST_QUERY", () => {
  it("requests newest ordering so the DB window is createdAt DESC before LIMIT", () => {
    expect(STUDIO_LIBRARY_LIST_QUERY).toEqual({
      limit: 50,
      sort: "newest",
    });
  });

  it("is the input Studio Library sends to carouselRemake.list", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const studioApp = readFileSync(join(here, "CarouselStudioApp.tsx"), "utf8");
    expect(studioApp).toContain("STUDIO_LIBRARY_LIST_QUERY");
    expect(studioApp).toMatch(
      /carouselRemake\.list\.useQuery\(\s*STUDIO_LIBRARY_LIST_QUERY/
    );
    expect(studioApp).not.toMatch(
      /carouselRemake\.list\.useQuery\(\s*\{\s*limit:\s*50\s*\}/
    );
  });
});

describe("STUDIO_NAV_ITEMS", () => {
  it("keeps Library and drops Downloads", () => {
    const ids = STUDIO_NAV_ITEMS.map(([id]) => id);
    expect(ids).toContain("library");
    expect(ids).not.toContain("downloads");
    expect(STUDIO_NAV_ITEMS.map(([, label]) => label)).not.toContain("Downloads");
  });
});

describe("mapStudioLibraryRows", () => {
  it("maps query rows into library cards, newest first", () => {
    const cards = mapStudioLibraryRows([
      {
        id: 2,
        title: "Older carousel",
        slideCount: 6,
        createdAt: "2026-08-01T12:00:00.000Z",
        status: "completed",
        thumbnailUrl: "https://cdn.example/old.png",
        aspectRatioOverride: "1:1",
      },
      {
        id: 9,
        title: "Check weekly numbers",
        slideCount: 8,
        createdAt: "2026-08-31T12:00:00.000Z",
        status: "completed",
        thumbnailUrl: "https://cdn.example/new.png",
        aspectRatioOverride: "4:5",
      },
    ]);

    expect(cards.map((card) => card.id)).toEqual([9, 2]);
    expect(cards[0]).toMatchObject({
      title: "Check weekly numbers",
      slideCount: 8,
      statusLabel: "Ready",
      aspectRatio: "4:5",
      thumbnailUrl: "https://cdn.example/new.png",
    });
    expect(studioLibraryCardMeta(cards[0])).toContain("8 slides");
    expect(studioLibraryCardMeta(cards[0])).toContain("Ready");
    expect(studioLibraryCardMeta(cards[0])).toContain("4:5");
  });

  it("renders an empty list when the query returns no rows", () => {
    expect(mapStudioLibraryRows([])).toEqual([]);
  });

  it("labels failed rows without inventing restaurant mock titles", () => {
    const cards = mapStudioLibraryRows([
      {
        id: 3,
        title: "Untitled carousel",
        slideCount: 0,
        createdAt: "2026-08-20T12:00:00.000Z",
        status: "failed",
        errorMessage: "Image generation failed",
      },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].statusLabel).toBe("Failed");
    expect(cards[0].errorMessage).toBe("Image generation failed");
    expect(cards[0].title).not.toMatch(/pricing mistakes/i);
  });
});

describe("commandForLibraryCard", () => {
  it("opens a completed remake in the editor without generating", () => {
    const command = commandForLibraryCard({ id: 42, status: "completed" });
    expect(command).toEqual({ kind: "open_completed", remakeId: 42 });
    expect(libraryOpenStartsGeneration(command)).toBe(false);
  });

  it("does not reopen or regenerate a failed remake", () => {
    const command = commandForLibraryCard({
      id: 7,
      status: "failed",
      errorMessage: "Worker timed out",
    });
    expect(command).toEqual({
      kind: "show_failed",
      remakeId: 7,
      errorMessage: "Worker timed out",
    });
    expect(command.kind).not.toBe("open_completed");
    expect(libraryOpenStartsGeneration(command)).toBe(false);
  });
});
