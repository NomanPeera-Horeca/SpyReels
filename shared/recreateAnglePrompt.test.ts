import { describe, expect, it } from "vitest";
import { buildRecreateTopicPrompt } from "./recreateAnglePrompt";

describe("buildRecreateTopicPrompt", () => {
  it("preserves the SAME_TOPIC sentinel for keep-topic remakes", () => {
    expect(
      buildRecreateTopicPrompt({
        angle: "SAME_TOPIC",
        targetAudience: "Restaurant owners",
        businessDescription: "Restaurant education",
      })
    ).toBe("SAME_TOPIC");
  });

  it("keeps a real creator angle as the topic ground truth", () => {
    const prompt = buildRecreateTopicPrompt({
      angle: "Use this four-box framework for how to write a restaurant menu",
      targetAudience: "Restaurant owners",
      businessDescription: "Restaurant education",
    });

    expect(prompt).toContain("Use this four-box framework for how to write a restaurant menu");
    expect(prompt).toContain("Restaurant owners");
  });
});
