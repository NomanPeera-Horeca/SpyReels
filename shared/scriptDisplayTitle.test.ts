import { describe, expect, it } from "vitest";
import {
  deriveScriptTitleFromContent,
  isGenericScriptTitle,
  scriptDisplayTitle,
} from "./scriptDisplayTitle";

describe("scriptDisplayTitle", () => {
  it("preserves a meaningful saved title", () => {
    expect(
      scriptDisplayTitle("Stop Sending Just Checking In", "Different content")
    ).toBe("Stop Sending Just Checking In");
  });

  it("replaces the generic Remake script title from script content", () => {
    expect(
      scriptDisplayTitle(
        "Remake script",
        "what does it actually cost to start a coffee business from scratch? because this is the number one question people ask."
      )
    ).toBe("What Does It Actually Cost to Start a Coffee Business");
  });

  it("skips weak picture-this openers", () => {
    expect(
      deriveScriptTitleFromContent(
        "Picture this. You walk into a Chick-fil-A interview and the manager asks one question."
      )
    ).toBe("You Walk Into a Chick-fil-A Interview and the Manager Asks");
  });

  it("recognizes raw Remake prompt titles as generic", () => {
    expect(isGenericScriptTitle("Remake: make it for me that I tell to Leo")).toBe(true);
  });
});
