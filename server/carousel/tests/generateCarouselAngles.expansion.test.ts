import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANGLE_GENERATION_COMPLETED } from "../angleGenerationObservability";

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../../_core/llm";
import {
  buildCarouselAngleCandidatesJsonSchema,
  buildCarouselAngleCandidatesUserPrompt,
  buildCarouselAngleExpansionSystemPrompt,
  buildCarouselAngleExpansionUserPrompt,
  buildCarouselAngleFullBriefExpansionJsonSchema,
  generateCarouselAngles,
} from "../generateCarouselAngles";

const mockedInvokeLLM = vi.mocked(invokeLLM);

function sampleOutline(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    role: i === 0 ? "hook" : i === count - 1 ? "takeaway" : "problem",
    objective: `Cover beat ${i + 1} without repeating other slides.`,
    recommendedVisual: i === 0 ? "text" : "checklist",
  }));
}

function sampleKeyPoints() {
  return Array.from({ length: 4 }, (_, i) => ({
    title: `Point ${i + 1}`,
    explanation: `Explain useful point ${i + 1} in one sentence.`,
    purpose: `Advance the argument at step ${i + 1}.`,
  }));
}

function compactCandidate(title: string, angleType: "diagnostic" | "story" | "how_to") {
  const contentFormat =
    angleType === "story" ? "story" : angleType === "how_to" ? "framework" : "breakdown";
  return {
    kicker: "Strategy",
    title,
    description: `Develop ${title} as a distinct strategy.`,
    estimatedSlideCount: 6,
    topic: "small business cash flow",
    inferredAudience: "small business owners",
    contentGoal: "education",
    contentFormat,
    angleType,
    hook: `${title} hook`,
    corePromise: `${title} promise`,
    centralInsight: `${title} insight`,
    layoutFamily: contentFormat,
    claimRisk: "medium",
    researchMode: "claim_verification",
    scores: {
      relevance: 70,
      usefulness: 70,
      specificity: 70,
      visualPotential: 70,
      factualSafety: 70,
      originality: 70,
    },
    confidence: 0.8,
  };
}

function rawBrief(title: string, angleType: "diagnostic" | "story" | "how_to") {
  const candidate = compactCandidate(title, angleType);
  return {
    ...candidate,
    audienceReasoning: "The source names this audience.",
    keyPoints: sampleKeyPoints(),
    slideOutline: sampleOutline(6),
    visualDirection: "Simple numbered breakdown cards.",
    imageDirection: "Neutral desk and ledger photos.",
    evidenceRequirements: ["Verify cash-cycle claims"],
    prohibitedClaims: ["Guaranteed profit in 30 days"],
    ctaDirection: "Save this cash-check list",
  };
}

function llmResult(payload: Record<string, unknown>) {
  return {
    id: "msg_test",
    created: 0,
    model: "claude-sonnet-4-6",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: JSON.stringify(payload),
        },
        finish_reason: "stop",
      },
    ],
  };
}

function completionPayload(): Record<string, unknown> {
  const call = (console.info as unknown as { mock: { calls: unknown[][] } }).mock
    .calls
    .find((entry) => entry[0] === ANGLE_GENERATION_COMPLETED);
  expect(call).toBeDefined();
  return call?.[1] as Record<string, unknown>;
}

describe("generateCarouselAngles parallel full expansion", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("expands every compact candidate into a complete brief before ranking", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        llmResult({
          angles: [
            compactCandidate("Diagnostic cash", "diagnostic"),
            compactCandidate("Cash story", "story"),
            compactCandidate("Cash how-to", "how_to"),
          ],
        })
      )
      .mockResolvedValueOnce(llmResult({ brief: rawBrief("Diagnostic cash", "diagnostic") }))
      .mockResolvedValueOnce(llmResult({ brief: rawBrief("Cash story", "story") }))
      .mockResolvedValueOnce(llmResult({ brief: rawBrief("Cash how-to", "how_to") }));

    const briefs = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 1,
    });

    expect(mockedInvokeLLM).toHaveBeenCalledTimes(4);
    expect(briefs).toHaveLength(3);
    expect(briefs.map((brief) => brief.title)).toEqual(
      expect.arrayContaining(["Diagnostic cash", "Cash story", "Cash how-to"])
    );
    const expansionCalls = mockedInvokeLLM.mock.calls.slice(1);
    const expansionTexts = expansionCalls.map((call) =>
      String(call[0]?.messages?.[1]?.content ?? "")
    );
    expect(expansionTexts.some((text) => text.includes("Diagnostic cash"))).toBe(
      true
    );
    expect(expansionTexts.some((text) => text.includes("Cash story"))).toBe(true);
    expect(expansionTexts.some((text) => text.includes("Cash how-to"))).toBe(
      true
    );
    const payload = completionPayload();
    expect(payload.angleGenerationMode).toBe("parallel_full_expansions");
    expect(payload.expansionRan).toBe(true);
    expect(payload.compactCandidateCount).toBe(3);
    expect(Array.isArray(payload.expansions)).toBe(true);
    expect((payload.expansions as unknown[]).length).toBe(3);
    expect(typeof payload.parallelExpansionWallClockMs).toBe("number");
  });

  it("keeps ranking among valid full briefs when one expansion fails", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        llmResult({
          angles: [
            compactCandidate("Broken diagnostic", "diagnostic"),
            compactCandidate("Cash story", "story"),
            compactCandidate("Cash how-to", "how_to"),
          ],
        })
      )
      .mockResolvedValueOnce(
        llmResult({
          brief: {
            ...rawBrief("Broken diagnostic", "diagnostic"),
            slideOutline: sampleOutline(6).map((slide, index) =>
              index === 5 ? { ...slide, role: "insight" } : slide
            ),
          },
        })
      )
      .mockResolvedValueOnce(llmResult({ brief: rawBrief("Cash story", "story") }))
      .mockResolvedValueOnce(llmResult({ brief: rawBrief("Cash how-to", "how_to") }))
      .mockResolvedValueOnce(
        llmResult({
          brief: {
            ...rawBrief("Broken diagnostic", "diagnostic"),
            slideOutline: sampleOutline(6).map((slide, index) =>
              index === 5 ? { ...slide, role: "insight" } : slide
            ),
          },
        })
      );

    const briefs = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 1,
    });

    expect(briefs.map((brief) => brief.title)).toEqual(
      expect.arrayContaining(["Cash story", "Cash how-to"])
    );
    expect(briefs.map((brief) => brief.title)).not.toContain("Broken diagnostic");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(5);
  });
});

describe("generateCarouselAngles expansion schema and prompts", () => {
  it("compact schema omits outline fields", () => {
    const schema = buildCarouselAngleCandidatesJsonSchema();
    const items = (
      schema.schema.properties as {
        angles: { items: { required: string[]; properties: Record<string, unknown> } };
      }
    ).angles.items;
    expect(items.required).not.toContain("keyPoints");
    expect(items.required).not.toContain("slideOutline");
    expect(items.properties).not.toHaveProperty("keyPoints");
    expect(items.properties).not.toHaveProperty("slideOutline");
    expect(items.required).toEqual(
      expect.arrayContaining([
        "title",
        "hook",
        "corePromise",
        "centralInsight",
        "angleType",
      ])
    );
  });

  it("expansion schema requires a complete brief, not a slim payload", () => {
    const schema = buildCarouselAngleFullBriefExpansionJsonSchema();
    const brief = (
      schema.schema.properties as {
        brief: { required: string[]; properties: Record<string, unknown> };
      }
    ).brief;
    expect(brief.required).toEqual(
      expect.arrayContaining([
        "kicker",
        "title",
        "audienceReasoning",
        "keyPoints",
        "slideOutline",
        "visualDirection",
        "imageDirection",
        "evidenceRequirements",
        "prohibitedClaims",
        "ctaDirection",
        "scores",
      ])
    );
    expect(schema.schema.required).toEqual(["brief"]);
    expect(schema.schema.properties).not.toHaveProperty("expansion");
  });

  it("expansion prompt asks for a full brief and not a slim payload", () => {
    const system = buildCarouselAngleExpansionSystemPrompt();
    const user = buildCarouselAngleExpansionUserPrompt({
      sourceContent: "Why small businesses run out of cash.",
      candidate: compactCandidate("Cash story", "story"),
    });
    expect(system).toContain("complete production-ready creative brief");
    expect(system).toContain("Do not return a slim expansion payload.");
    expect(user).toContain("complete production-ready creative brief");
    expect(user).toContain("This is not a slim expansion payload.");
    expect(user).toContain("Cash story");
    expect(user).not.toContain("The assembler copies those selected strategy fields");
  });

  it("compact prompt stays candidate-only", () => {
    const user = buildCarouselAngleCandidatesUserPrompt({
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    expect(user).toContain("compact candidates only");
    expect(user).toContain("Do not write keyPoints, slideOutline");
    expect(user).toContain("EXPLICIT LIST CONTRACT");
    expect(user).toContain("promised count 6");
  });
});
