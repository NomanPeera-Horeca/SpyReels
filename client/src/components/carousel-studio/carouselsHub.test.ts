import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_LIBRARY_PATH,
  CAROUSEL_STUDIO_PATH,
  CAROUSELS_LIBRARY_PATH,
  CAROUSELS_NEW_PATH,
  CAROUSELS_PATH,
  CAROUSELS_SIDEBAR_LABEL,
  buildCarouselEditHref,
  buildCarouselGenerateHref,
  isCarouselsNavActive,
  legacyStudioRedirectPath,
  parseCarouselEditRemakeId,
  parseStudioLaunchSearch,
  pickRecentCarousels,
} from "./carouselsHub";

const here = dirname(fileURLToPath(import.meta.url));

describe("carousels hub navigation", () => {
  it("keeps the sidebar label as Carousels, not Library", () => {
    const layout = readFileSync(
      join(here, "../DashboardLayout.tsx"),
      "utf8"
    );
    expect(layout).toContain(`label: "${CAROUSELS_SIDEBAR_LABEL}"`);
    expect(layout).toContain(`path: "${CAROUSELS_PATH}"`);
    expect(layout).not.toMatch(/label:\s*"Carousel Library"/);
    expect(layout).not.toMatch(/label:\s*"Library"/);
    expect(layout).toContain("isCarouselsNavActive");
  });

  it("hands Generate and recent opens to Carousels editor routes", () => {
    const studioApp = readFileSync(
      join(here, "./CarouselStudioApp.tsx"),
      "utf8"
    );
    expect(studioApp).toContain("launchRemakeId");
    expect(studioApp).toContain("launchContent");
    expect(studioApp).toContain("generateDirectRef.current()");
    expect(studioApp).toContain("openCompletedFromLibraryRef.current");
    expect(studioApp).toContain("buildCarouselEditHref");
  });

  it("registers Carousels-owned routes and keeps old URLs as redirects", () => {
    const app = readFileSync(join(here, "../../App.tsx"), "utf8");
    expect(app).toContain(`path="${CAROUSELS_PATH}"`);
    expect(app).toContain(`path="${CAROUSELS_LIBRARY_PATH}"`);
    expect(app).toContain(`path="${CAROUSELS_NEW_PATH}"`);
    expect(app).toContain('path="/carousels/:remakeId/edit"');
    expect(app).toContain(`path="${CAROUSEL_LIBRARY_PATH}"`);
    expect(app).toContain(`path="${CAROUSEL_STUDIO_PATH}"`);
    expect(app).toContain(`Redirect to="${CAROUSELS_LIBRARY_PATH}"`);
  });

  it("marks hub, library, and editor as the Carousels nav item", () => {
    expect(isCarouselsNavActive("/carousels")).toBe(true);
    expect(isCarouselsNavActive("/carousels/library")).toBe(true);
    expect(isCarouselsNavActive("/carousels/118/edit")).toBe(true);
    expect(isCarouselsNavActive("/carousel-library")).toBe(true);
    expect(isCarouselsNavActive("/studio")).toBe(false);
  });

  it("builds editor launch URLs without changing generation APIs", () => {
    expect(buildCarouselGenerateHref("  menu idea  ")).toBe(
      "/carousels/new?content=menu+idea"
    );
    expect(buildCarouselEditHref(118)).toBe("/carousels/118/edit");
    expect(parseCarouselEditRemakeId("/carousels/118/edit")).toBe(118);
  });

  it("redirects legacy Studio URLs into the Carousels product", () => {
    expect(legacyStudioRedirectPath("?content=How+to+simplify")).toBe(
      "/carousels/new?content=How+to+simplify"
    );
    expect(legacyStudioRedirectPath("?remakeId=118")).toBe(
      "/carousels/118/edit"
    );
    expect(legacyStudioRedirectPath("")).toBe("/carousels");
  });

  it("parses Studio launch search for generate and reopen", () => {
    expect(parseStudioLaunchSearch("?content=How+to+simplify")).toEqual({
      kind: "generate",
      content: "How to simplify",
    });
    expect(parseStudioLaunchSearch("?remakeId=118")).toEqual({
      kind: "open_remake",
      remakeId: 118,
    });
    expect(parseStudioLaunchSearch("")).toEqual({ kind: "none" });
    expect(parseStudioLaunchSearch("?remakeId=0")).toEqual({ kind: "none" });
  });

  it("picks only completed remakes for Recent Carousels", () => {
    const rows = [
      { id: 1, status: "completed" },
      { id: 2, status: "failed" },
      { id: 3, status: "completed" },
    ];
    expect(pickRecentCarousels(rows, 6).map((row) => row.id)).toEqual([1, 3]);
  });
});
