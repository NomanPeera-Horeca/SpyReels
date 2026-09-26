import { describe, expect, it } from "vitest";
import {
  buildRemakeOutputLanguageRules,
  DEFAULT_REMAKE_OUTPUT_LANGUAGE,
  remakeOutputLanguageSystemClause,
} from "./remakeOutputLanguage";

describe("remakeOutputLanguage", () => {
  it("defaults to English hard rules for spoken remakes", () => {
    const rules = buildRemakeOutputLanguageRules();
    expect(DEFAULT_REMAKE_OUTPUT_LANGUAGE).toBe("English");
    expect(rules).toContain("OUTPUT LANGUAGE (HARD RULE)");
    expect(rules).toContain("English");
    expect(rules).toContain("Do not leave the remake in the source language");
  });

  it("includes the system clause used by writer and repair passes", () => {
    expect(remakeOutputLanguageSystemClause()).toContain(
      "Always write the spoken remake script in English"
    );
  });
});
