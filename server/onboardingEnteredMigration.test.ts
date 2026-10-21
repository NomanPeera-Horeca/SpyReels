import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/0107_onboarding_entered_at.sql", "utf8");

describe("0107 onboardingEnteredAt migration", () => {
  it("adds one nullable column and stamps only that column for earlier accounts", () => {
    expect(sql.toLowerCase()).not.toContain("drop ");
    expect(sql.toLowerCase()).not.toContain("delete ");
    expect(sql).toContain("ADD COLUMN `onboardingEnteredAt` DATETIME NULL");
    expect(sql).not.toContain("onboardingCompletedAt` =");
    expect(sql).not.toContain("onboardingSkippedAt` =");
    expect(sql).not.toContain("selectedNicheSlugs");
    expect(sql).not.toContain("businessDescription");
    expect(sql).toContain("SET `onboardingEnteredAt`");
    expect(sql).toContain("`onboardingEnteredAt` IS NULL");
    expect(sql).toContain("`createdAt` <");
    expect(sql).toContain("@needs_backfill");
  });

  it("does not give new accounts a server default that would skip onboarding", () => {
    const alter = sql
      .split("\n")
      .find(line => line.includes("ADD COLUMN `onboardingEnteredAt`"));
    expect(alter?.toUpperCase()).not.toContain("DEFAULT");
  });
});
