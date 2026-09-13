import { describe, expect, it } from "vitest";
import { deriveScriptTitle, isWeakScriptTitle } from "./scriptTitle";

describe("script title derivation", () => {
  it("rejects generic remake labels", () => {
    expect(isWeakScriptTitle("Remake script")).toBe(true);
    expect(isWeakScriptTitle("AI Script")).toBe(true);
  });

  it("rejects raw remake instructions as titles", () => {
    expect(isWeakScriptTitle("Remake: make it for me that I tell to Leo")).toBe(true);
  });

  it("uses a clean topic when one is available", () => {
    expect(
      deriveScriptTitle({
        content: "Some body copy here.",
        topic: "restaurant menu pricing mistakes",
      })
    ).toBe("Restaurant Menu Pricing Mistakes");
  });

  it("falls back to the first meaningful spoken line", () => {
    const title = deriveScriptTitle({
      content:
        "Picture this. You walk into a Chick-fil-A interview and the manager asks one question that changes how you think about service.",
      topic: "SAME_TOPIC",
    });
    expect(title).toBe("You Walk Into a Chick-fil-A Interview and the Manager");
  });

  it("does not leak a custom user instruction", () => {
    const title = deriveScriptTitle({
      content: "When a client goes silent, stop sending just checking in texts. Here is what to say instead.",
      topic: "make it for me that I tell to Leo about restaurant equipment",
    });
    expect(title).toBe("When a Client Goes Silent Stop Sending Just Checking");
  });
});
