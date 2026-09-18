import { describe, expect, it } from "vitest";
import { validateRemakeFactRisk } from "./remakeFactRisk";

describe("validateRemakeFactRisk", () => {
  it("flags an invented founder name and unsupported year", () => {
    const result = validateRemakeFactRisk({
      script:
        "His name is Marcus. He got laid off in 2019 and opened a restaurant that became a hit.",
      trustedTexts: ["restaurant owners", "profit systems"],
    });

    expect(result.safe).toBe(false);
    expect(result.risks.some((risk) => risk.value.includes("Marcus"))).toBe(true);
    expect(result.risks.some((risk) => risk.value.includes("2019"))).toBe(true);
  });

  it("allows supported named facts from research", () => {
    const result = validateRemakeFactRisk({
      script:
        "The Cheesecake Factory opened in Beverly Hills in 1978. That growth story is useful because the source is verified.",
      trustedTexts: [
        "The Cheesecake Factory opened in Beverly Hills in 1978.",
      ],
    });

    expect(result.safe).toBe(true);
  });

  it("allows generic framework numbers without treating them as factual claims", () => {
    const result = validateRemakeFactRisk({
      script: "Here are 3 steps to tighten your menu before you add more items.",
      trustedTexts: [],
    });

    expect(result.safe).toBe(true);
  });

  it("flags unsupported attributed quotes", () => {
    const result = validateRemakeFactRisk({
      script: 'The founder said, "We doubled profit in 30 days."',
      trustedTexts: [],
    });

    expect(result.safe).toBe(false);
    expect(result.risks.some((risk) => risk.kind === "unsupported_quote")).toBe(
      true
    );
  });
});
