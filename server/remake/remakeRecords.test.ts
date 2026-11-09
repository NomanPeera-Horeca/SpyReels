import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DUPLICATE_WINDOW_MS,
  REMAKE_CHOICES,
  isOwnWinnerChoice,
  isReusableRequest,
  resolveRemakeRequest,
} from "./remakeRecords";
import { remakeIntentToRequest } from "../../client/src/lib/remakeIntent";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("resolveRemakeRequest: each choice builds the expected topic", () => {
  it("Use my idea uses the typed idea and requires one", () => {
    expect(resolveRemakeRequest({ choice: "use_my_idea", idea: "  restaurant menus " })).toEqual({
      ok: true,
      topic: "restaurant menus",
      choice: "use_my_idea",
      idea: "restaurant menus",
      prismFormat: null,
      treatment: null,
    });
    expect(resolveRemakeRequest({ choice: "use_my_idea", idea: "  " }).ok).toBe(false);
  });
  it("Keep this topic is the live SAME_TOPIC rule", () => {
    expect(resolveRemakeRequest({ choice: "keep_topic", topic: "ignored" })).toMatchObject({ ok: true, topic: "SAME_TOPIC" });
  });
  it("Adapt to my niche lets the server pick the niche angle", () => {
    expect(resolveRemakeRequest({ choice: "adapt_niche", idea: "ignored" })).toMatchObject({ ok: true, topic: "", idea: null });
  });
  it("own-winner choices are refused on videos that are not the creator's own", () => {
    for (const choice of ["prism_format", "refresh_original", "own_idea"] as const) {
      expect(isOwnWinnerChoice(choice)).toBe(true);
      expect(resolveRemakeRequest({ choice, idea: "x" }).ok).toBe(false);
    }
    expect(REMAKE_CHOICES).toHaveLength(6);
  });
  it("old requests with only `topic` still work unchanged", () => {
    expect(resolveRemakeRequest({ topic: " my angle " })).toEqual({
      ok: true,
      topic: "my angle",
      choice: null,
      idea: null,
      prismFormat: null,
      treatment: null,
    });
    expect(resolveRemakeRequest({ topic: "SAME_TOPIC" })).toMatchObject({ topic: "SAME_TOPIC" });
    expect(resolveRemakeRequest({})).toMatchObject({ ok: true, topic: "" });
  });
});

describe("popup choice → request", () => {
  it("maps the three popup options", () => {
    expect(remakeIntentToRequest({ mode: "custom", angle: " menus " })).toEqual({ choice: "use_my_idea", idea: "menus" });
    expect(remakeIntentToRequest({ mode: "same_topic" })).toEqual({ choice: "keep_topic" });
    expect(remakeIntentToRequest({ mode: "niche" })).toEqual({ choice: "adapt_niche" });
  });
});

describe("duplicate guard", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("returns the same remake for a repeat within 10 minutes", () => {
    expect(isReusableRequest({ status: "processing", createdAt: new Date(now - 60_000) }, now)).toBe(true);
    expect(isReusableRequest({ status: "completed", createdAt: new Date(now - DUPLICATE_WINDOW_MS) }, now)).toBe(true);
  });
  it("starts a new one after a failure, after 10 minutes, or with no match", () => {
    expect(isReusableRequest({ status: "failed", createdAt: new Date(now - 1000) }, now)).toBe(false);
    expect(isReusableRequest({ status: "processing", createdAt: new Date(now - DUPLICATE_WINDOW_MS - 1) }, now)).toBe(false);
    expect(isReusableRequest(null, now)).toBe(false);
  });
});

describe("wiring", () => {
  const router = read("server/routers/recreateRouter.ts");
  const gen = router.slice(router.indexOf("    generate: protectedProcedure"), router.indexOf("    rewrite: protectedProcedure"));
  it("checks for a duplicate before any usage is charged", () => {
    expect(gen.indexOf("findReusableRequest")).toBeGreaterThan(-1);
    expect(gen.indexOf("findReusableRequest")).toBeLessThan(gen.indexOf("incrementUsage"));
  });
  it("saves the choice, idea and request id on the new remake", () => {
    expect(gen.indexOf("saveRemakeRequestFields")).toBeGreaterThan(gen.indexOf("createRecreatedScript("));
  });
  it("records a draft publication when the draft is saved", () => {
    expect(read("server/routers/scriptsRouter.ts")).toContain("createDraftPublication");
  });
  it("the chain sends choice, idea and a request id", () => {
    const hook = read("client/src/hooks/useLibraryRemakeChain.ts");
    expect(hook).toContain("remakeIntentToRequest(intent)");
    expect(hook).toContain("clientRequestId");
  });
});

describe("migration 0118 is additive", () => {
  const sqlText = read("drizzle/0118_remake_request_records.sql");
  const statements = sqlText.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  it("only adds columns, an index and new tables", () => {
    expect(statements).not.toMatch(/\bDROP\b/i);
    expect(statements).not.toMatch(/\bMODIFY\b|\bCHANGE COLUMN\b|\bRENAME\b/i);
    expect(statements).toMatch(/ADD COLUMN `clientRequestId`/);
    expect(statements).toMatch(/CREATE TABLE IF NOT EXISTS `remake_publications`/);
    expect(statements).toMatch(/CREATE TABLE IF NOT EXISTS `own_winner_formats`/);
  });
});
