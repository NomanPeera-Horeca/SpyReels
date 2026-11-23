import { describe, expect, it } from "vitest";
import { accountSubtitle, buildSidebarV2Sections, isSidebarV2Active } from "./sidebarV2";

const labels = (opts: { homeV2: boolean; showUnpolishedTools: boolean }) =>
  buildSidebarV2Sections(opts).map(s => [s.label, s.items.map(i => i.label)]);

describe("sidebar v2 menu", () => {
  it("matches the approved Figma order", () => {
    expect(labels({ homeV2: true, showUnpolishedTools: false })).toEqual([
      ["", ["Home"]],
      ["Find ideas", ["Viral Videos", "Creator Research", "Saved"]],
      ["Make videos", ["My Plan", "My Scripts"]],
    ]);
  });

  it("drops Dashboard, Billing, Paste Script, Creator Radar and Collected Reels from the menu", () => {
    const paths = buildSidebarV2Sections({ homeV2: true, showUnpolishedTools: true }).flatMap(s => s.items.map(i => i.path));
    for (const gone of ["/dashboard", "/billing", "/paste", "/history", "/collected", "/settings", "/studio"]) {
      expect(paths).not.toContain(gone);
    }
  });

  it("has no Home item without Home v2 (Creator Research is the home then)", () => {
    expect(labels({ homeV2: false, showUnpolishedTools: false })[0]).toEqual(["Find ideas", ["Viral Videos", "Creator Research", "Saved"]]);
  });

  it("adds the admin-only tools for admins only", () => {
    const admin = buildSidebarV2Sections({ homeV2: true, showUnpolishedTools: true }).flatMap(s => s.items.map(i => i.label));
    expect(admin).toEqual(expect.arrayContaining(["Carousels", "B-Roll Library", "My Virality Report"]));
    const user = buildSidebarV2Sections({ homeV2: true, showUnpolishedTools: false }).flatMap(s => s.items.map(i => i.label));
    expect(user).not.toContain("Carousels");
  });
});

describe("which item is selected", () => {
  it("lights the item a folded page belongs to", () => {
    expect(isSidebarV2Active("/history", "/research", true)).toBe(true);
    expect(isSidebarV2Active("/collected", "/saved", true)).toBe(true);
    expect(isSidebarV2Active("/paste", "/scripts", true)).toBe(true);
    expect(isSidebarV2Active("/scripts/42", "/scripts", true)).toBe(true);
    expect(isSidebarV2Active("/billing", "/settings", true)).toBe(true);
    expect(isSidebarV2Active("/studio", "/studio", true)).toBe(true);
  });

  it("Home is only lit on Home; without Home v2 the start page is Creator Research", () => {
    expect(isSidebarV2Active("/", "/", true)).toBe(true);
    expect(isSidebarV2Active("/", "/research", true)).toBe(false);
    expect(isSidebarV2Active("/", "/research", false)).toBe(true);
    expect(isSidebarV2Active("/research", "/", true)).toBe(false);
  });

  it("does not light look-alike paths", () => {
    expect(isSidebarV2Active("/saved-later", "/saved", true)).toBe(false);
    expect(isSidebarV2Active("/plan", "/viral-posts", true)).toBe(false);
  });
});

describe("account line", () => {
  it("shows the niche, or nothing", () => {
    expect(accountSubtitle("Restaurants & cafés")).toBe("Restaurants & cafés");
    expect(accountSubtitle("  ")).toBeNull();
    expect(accountSubtitle(null)).toBeNull();
  });
});
