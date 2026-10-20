import { describe, expect, it, vi } from "vitest";
import { readOptional } from "./optionalRead";

describe("readOptional", () => {
  it("returns the value when the read succeeds", async () => {
    await expect(readOptional("analysis", async () => "saved", null)).resolves.toBe("saved");
  });

  it("returns the fallback when the read throws, without dropping the caller", async () => {
    const warn = vi.fn();
    await expect(
      readOptional(
        "subtopics",
        async () => {
          throw new Error("table missing");
        },
        [],
        warn
      )
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith("[onboarding] subtopics unavailable (Error)");
  });
});
