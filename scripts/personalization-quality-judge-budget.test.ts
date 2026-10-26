import { describe, expect, it } from "vitest";
import {
  judgeCallReserveUsd,
  judgeFitsBudget,
} from "./personalization-quality-judge";

describe("independent personalization judge spending gate", () => {
  const profile = "Name: A teacher\\nBio: Math tips for students";
  const output = "Niche label: math tutoring\\nGoal: Explain algebra clearly";

  it("reserves a full bounded response, not only the usual small observed bill", () => {
    const reserve = judgeCallReserveUsd(profile, output);
    expect(reserve).toBeGreaterThan(0.007);
    expect(reserve).toBeLessThan(0.04);
  });

  it("refuses the next call when the authorized cap would be crossed", () => {
    const reserve = judgeCallReserveUsd(profile, output);
    expect(judgeFitsBudget(0, reserve, profile, output)).toBe(true);
    expect(judgeFitsBudget(0.49, 0.5, profile, output)).toBe(false);
  });

  it("reserves more for longer input without making a provider request", () => {
    const short = judgeCallReserveUsd(profile, output);
    const long = judgeCallReserveUsd(profile.repeat(25), output.repeat(10));
    expect(long).toBeGreaterThan(short);
  });
});
