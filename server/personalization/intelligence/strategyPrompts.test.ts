import { describe, expect, it } from "vitest";
import { buildAudiencePrompt, parseAudienceOutput } from "./audienceRecommendations";
import { buildCreatorEvidence } from "./evidence";
import { buildGoalPrompt, parseGoalOutput } from "./goalInference";
import { buildPillarPrompt, parsePillarOutput } from "./pillarRecommendations";

const evidence = buildCreatorEvidence({
  platform: "instagram",
  displayName: "Cafe Supply",
  bio: "Commercial kitchen equipment. DM for a quote.",
  snapshot: null,
  items: [],
});

describe("strategy prompts", () => {
  it("asks for a goal grounded in the bio, call to action, and website", () => {
    const prompt = buildGoalPrompt(evidence);
    expect(prompt.system).toContain("call to action");
    expect(prompt.system).toContain("website");
    expect(prompt.system).toContain("confirmed answers");
  });

  it("asks for a segment, a problem, and an outcome", () => {
    const prompt = buildAudiencePrompt(evidence, "Help owners buy the right equipment.", []);
    expect(prompt.system).toContain("problem");
    expect(prompt.system).toContain("outcome");
  });

  it("keeps niche examples off the fast pillar prompt", () => {
    const plain = buildPillarPrompt(evidence, "Help owners buy equipment.", [], []);
    expect(plain.user).not.toContain("Qualified examples");
    expect(plain.system).toContain("Do not just relabel what they posted before");
    const enriched = buildPillarPrompt(
      evidence,
      "Help owners buy equipment.",
      [{ who: "Restaurant owners", outcome: "buy the right gear", problem: "unclear quotes" }],
      [],
      [{ hook: "Stop buying the cheapest fryer", format: "talking-head" }]
    );
    expect(enriched.user).toContain("Stop buying the cheapest fryer");
    expect(enriched.user).toContain("unclear quotes");
    expect(enriched.system).toContain("Do not predict how many views");
    const parsed = parsePillarOutput(
      {
        pillars: [
          {
            title: "Quote walkthroughs",
            serves: "Shows owners which questions to ask before they buy.",
            subtopics: ["Ask for the install quote first"],
          },
          {
            title: "First kitchen budget",
            serves: "Helps founders spend on the gear that matters most.",
            subtopics: ["Price the oven before the dining room"],
          },
          {
            title: "Opening checks",
            serves: "Gives new owners a simple order for the first week.",
            subtopics: ["Walk the line before the first service"],
          },
        ],
        confidence: "high",
      },
      evidence,
      "Help owners buy equipment.",
      [],
      []
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.subtopics[0]).toEqual(["Ask for the install quote first"]);
    }
  });

  it("keeps a goal citation only for a real call to action or website fact", () => {
    const grounded = buildCreatorEvidence({
      platform: "instagram",
      displayName: "Cafe Supply",
      bio: "Commercial kitchen equipment. DM for a quote.",
      snapshot: null,
      items: [],
      profileEvidence: {
        username: "cafesupply",
        displayName: "Cafe Supply",
        bio: "Commercial kitchen equipment. DM for a quote.",
        category: null,
        cta: "DM for a quote.",
        websiteUrl: "https://example.com/menu",
        captions: [],
        website: {
          url: "https://example.com/menu",
          fetchedAt: "2026-10-24T16:00:00.000Z",
          title: "Cafe Supply Co",
          offers: ["Ovens and prep tables"],
          businessModel: "b2b",
          customers: ["Restaurant owners"],
          callsToAction: ["Book a showroom visit"],
          goalEvidence: ["Helping cafes fill more covers"],
        },
      },
    });
    const prompt = buildGoalPrompt(grounded);
    expect(prompt.user).toContain("DM for a quote.");
    expect(prompt.user).toContain("Book a showroom visit");
    expect(grounded.sources).toEqual(expect.arrayContaining(["cta", "website"]));
    const accepted = parseGoalOutput(
      {
        decision: "suggest",
        goal: "Help cafe owners book a showroom visit.",
        confidence: "high",
        evidence_basis: ["cta", "website", "captions"],
        clarifying_question: "",
        offer_quote: "Book a showroom visit",
      },
      grounded
    );
    expect(accepted.ok).toBe(true);
    if (accepted.ok && accepted.value.kind === "suggest") {
      expect(accepted.value.basis).toEqual(["cta", "website"]);
    }

    const thin = buildCreatorEvidence({
      platform: "instagram",
      displayName: "Cafe Supply",
      bio: "I film quiet mornings in the city.",
      snapshot: null,
      items: [],
    });
    const rejected = parseGoalOutput(
      {
        decision: "suggest",
        goal: "Share quiet mornings in the city.",
        confidence: "medium",
        evidence_basis: ["website"],
        clarifying_question: "",
        offer_quote: "",
      },
      thin
    );
    expect(rejected).toEqual({
      ok: false,
      reason: "evidence_basis must name sources that exist",
    });
  });

  it("stores an audience problem only when the evidence contains it", () => {
    const grounded = buildCreatorEvidence({
      platform: "instagram",
      displayName: "Cafe Supply",
      bio: "Commercial kitchen equipment. DM for a quote.",
      snapshot: null,
      items: [],
    });
    const parsed = parseAudienceOutput(
      {
        audiences: [
          {
            who: "Restaurant owners",
            problem: "unclear equipment quotes",
            outcome: "buy the right gear",
            why: "They need a quote before they buy.",
          },
          {
            who: "New owners",
            problem: "cannot sleep before service",
            outcome: "open with less stress",
            why: "A different segment.",
          },
        ],
        confidence: "high",
      },
      grounded,
      "Help owners buy the right equipment.",
      []
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.audiences[0]?.problem).toBe("unclear equipment quotes");
    expect(parsed.value.audiences[1]?.problem).toBeUndefined();
  });
});
