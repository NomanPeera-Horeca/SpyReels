import { describe, expect, it } from "vitest";
import type { InvokeParams, InvokeResult } from "../../_core/llm";
import { buildCreatorEvidence } from "./evidence";
import { buildAudiencePrompt, recommendAudiences, AUDIENCE_PROMPT_VERSION } from "./audienceRecommendations";
import { inferNicheLabel, NICHE_PROMPT_VERSION } from "./profileBasics";
import { GOAL_PROMPT_VERSION } from "./goalInference";
import { PILLAR_PROMPT_VERSION } from "./pillarRecommendations";

function scripted(output: Record<string, unknown>) {
  const calls: InvokeParams[] = [];
  const invoker = async (request: InvokeParams): Promise<InvokeResult> => {
    calls.push(request);
    return {
      id: "synthetic-only",
      created: 0,
      model: "claude-sonnet-4-6",
      choices: [{
        index: 0,
        message: { role: "assistant", content: JSON.stringify(output) },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    };
  };
  return { calls, invoker };
}

describe("targeted personalization quality contracts (no model calls)", () => {
  it("preserves approved Pillar versions; Goal moved to v3 for picked niches and subject words", () => {
    expect(GOAL_PROMPT_VERSION).toBe("goal-v3");
    expect(PILLAR_PROMPT_VERSION).toBe("pillars-v2");
    expect(NICHE_PROMPT_VERSION).toBe("niche-v5");
    expect(AUDIENCE_PROMPT_VERSION).toBe("audience-v4");
  });

  it("accepts an evidence-supported personal reflection niche without inventing an occupation", async () => {
    const evidence = buildCreatorEvidence({
      platform: "youtube",
      displayName: "Personal Notes",
      bio: "Thoughts on work, money and life.",
      snapshot: null,
      items: [],
    });
    const llm = scripted({ label: "Personal reflections on work and life", category: "Lifestyle" });
    const result = await inferNicheLabel({ evidence, invoker: llm.invoker });
    expect(result.niche).toMatchObject({
      label: "Personal reflections on work and life",
      categoryLabel: "Lifestyle",
    });
    expect(llm.calls).toHaveLength(1);
    const system = String(llm.calls[0].messages[0].content);
    expect(system).toContain("Personal reflections, observations, storytelling");
    expect(system).toContain("do not invent a specialty");
  });

  it("keeps a genuinely subjectless profile unanswered", async () => {
    const evidence = buildCreatorEvidence({
      platform: "instagram",
      displayName: "M.",
      bio: "vibes, links below",
      snapshot: null,
      items: [],
    });
    const llm = scripted({ label: "", category: "unknown" });
    const result = await inferNicheLabel({ evidence, invoker: llm.invoker });
    expect(result.niche).toBeNull();
    expect(llm.calls).toHaveLength(1);
  });

  it("anchors a family creator audience to the whole purpose rather than one incidental topic", async () => {
    const evidence = buildCreatorEvidence({
      platform: "instagram",
      displayName: "Our Family Life",
      bio: "Family of five. Real life, big messes, small wins.",
      snapshot: null,
      items: [],
    });
    const goal = "Share relatable everyday family experiences with other parents.";
    const prompt = buildAudiencePrompt(evidence, goal, []);
    expect(prompt.system).toContain("primary purpose from the bio, name, and confirmed goal");
    expect(prompt.system).toContain("A single post about a secondary subject");
    expect(prompt.system).toContain("connection, enjoyment, empathy, or inspiration");
    const llm = scripted({
      audiences: [
        { who: "Parents navigating family routines", outcome: "Feel understood in everyday family life", why: "They relate to messy routines and small wins." },
        { who: "Busy families", outcome: "Find practical family routines", why: "Family-life experiences can offer useful ideas." },
      ],
      confidence: "medium",
    });
    const output = await recommendAudiences({
      evidence,
      confirmedGoal: goal,
      confirmedAudiences: [],
      invoker: llm.invoker,
    });
    expect(output.audiences.map(a => a.who)).toEqual([
      "Parents navigating family routines", "Busy families",
    ]);
    expect(output.observedAudience).toBeNull();
  });
});
