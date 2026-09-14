import { describe, expect, it } from "vitest";
import {
  MAX_CONTENT_AGENT_STEPS,
  isMultiStepContentAgentRequest,
  splitContentAgentRequest,
} from "./contentAgentMultiStep";

describe("splitContentAgentRequest", () => {
  it("keeps a normal refine instruction as one step", () => {
    expect(splitContentAgentRequest("Make it shorter and funnier")).toEqual([
      { index: 0, text: "Make it shorter and funnier" },
    ]);
  });

  it("splits explicit creator sequencing", () => {
    expect(
      splitContentAgentRequest(
        "Remake this TikTok for coffee shops, make it 35 seconds, then create a carousel from it and save both"
      ).map((step) => step.text)
    ).toEqual([
      "Remake this TikTok for coffee shops",
      "make it 35 seconds",
      "create a carousel from it",
      "save both",
    ]);
  });

  it("splits schedule and save follow-up actions", () => {
    expect(
      splitContentAgentRequest(
        "Make this hook stronger then save it and remind me to film Friday at 10am in my office"
      ).map((step) => step.text)
    ).toEqual([
      "Make this hook stronger",
      "save it",
      "remind me to film Friday at 10am in my office",
    ]);
  });

  it("does not over-split ordinary prose", () => {
    expect(
      splitContentAgentRequest(
        "Create a Reel about why restaurant pricing matters, with a strong opening and a practical example"
      )
    ).toHaveLength(1);
  });

  it("caps plans to a safe number of tool steps", () => {
    const steps = splitContentAgentRequest(
      "Make it shorter then save it then download it then create a carousel then schedule filming Friday at 10am then give me 5 hooks"
    );
    expect(steps).toHaveLength(MAX_CONTENT_AGENT_STEPS);
  });

  it("identifies a real multi-step request", () => {
    expect(isMultiStepContentAgentRequest("Make it shorter then save it")).toBe(true);
    expect(isMultiStepContentAgentRequest("Make it shorter and clearer")).toBe(false);
  });
});
