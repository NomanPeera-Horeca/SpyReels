import { describe, expect, it } from "vitest";
import { deriveFrame0Text, frame0WordCount } from "./frame0Text";

describe("deriveFrame0Text", () => {
  it("turns zero-money-down restaurant equipment into a concise overlay", () => {
    expect(
      deriveFrame0Text(
        "Hey Leo, I think I just found you the restaurant equipment with zero money down. Nobody does that."
      )
    ).toBe("RESTAURANT EQUIPMENT\nWITH $0 DOWN?");
  });

  it("turns spoken Sunday closure wording into concise on-screen text", () => {
    expect(
      deriveFrame0Text("Chick-fil-A does not open on Sundays because of a principle the founder put in place.")
    ).toBe("CHICK-FIL-A\nCLOSED ON SUNDAYS");
  });

  it("removes a low-value scene-setting opener", () => {
    const value = deriveFrame0Text(
      "Picture this: your restaurant is packed on Friday night and you are still losing money."
    );
    expect(value).not.toContain("PICTURE THIS");
    expect(frame0WordCount(value)).toBeLessThanOrEqual(7);
  });

  it("compresses percentage language", () => {
    const value = deriveFrame0Text("Why 60 percent of new restaurants fail in the first year?");
    expect(value).toContain("60%");
    expect(value.endsWith("?")).toBe(true);
  });

  it("keeps the overlay fast to read", () => {
    const value = deriveFrame0Text(
      "This is the one restaurant pricing mistake that quietly destroys your profit every single week."
    );
    expect(frame0WordCount(value)).toBeLessThanOrEqual(7);
  });

  it("provides a safe fallback", () => {
    expect(deriveFrame0Text("   ")).toBe("YOUR HOOK GOES HERE");
  });
});
