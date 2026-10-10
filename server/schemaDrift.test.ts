import { describe, expect, it } from "vitest";
import {
  CRITICAL_SCHEMA_EXPECTATIONS,
  summarizeSchemaDrift,
  type SchemaDriftFinding,
} from "./schemaDrift";

describe("schemaDrift", () => {
  it("tracks Viral Posts library identity columns", () => {
    const keys = CRITICAL_SCHEMA_EXPECTATIONS.map(
      (e) => `${e.table}:${e.column ?? e.index ?? "table"}`
    );
    expect(keys).toContain("saved_reels:platform");
    expect(keys).toContain("saved_reels:sourceId");
    expect(keys).toContain(
      "saved_reels:idx_saved_reels_workspace_user_platform_source"
    );
  });

  it("summarizes findings for Telegram", () => {
    const findings: SchemaDriftFinding[] = [
      {
        kind: "missing_column",
        table: "saved_reels",
        column: "platform",
        feature: "Viral Posts",
      },
      {
        kind: "missing_index",
        table: "saved_reels",
        index: "idx_saved_reels_workspace_user_platform_source",
        feature: "Viral Posts",
      },
    ];
    expect(summarizeSchemaDrift(findings)).toContain("missing saved_reels.platform");
    expect(summarizeSchemaDrift([])).toBe("no critical schema drift");
  });
});
