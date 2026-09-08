import { describe, expect, it } from "vitest";
import {
  CONTENT_AGENT_TOOL_REGISTRY,
  extractSocialSource,
  looksLikeExistingScript,
  resolveContentAgentIntentRules,
  shouldUseLlmContentAgentClassifier,
} from "./contentAgentTools";

describe("SpyReels Content Agent tool registry", () => {
  it("registers the current creator-level jobs", () => {
    expect(Object.keys(CONTENT_AGENT_TOOL_REGISTRY)).toEqual(
      expect.arrayContaining([
        "write_viral_script",
        "refine_script",
        "generate_hook_ideas",
        "load_plan_card",
        "remake_social_video",
        "convert_existing_script",
        "create_carousel",
        "save_script",
        "schedule_filming",
        "download_script",
        "inspect_script_health",
      ])
    );
  });

  it("marks artifact actions as requiring a current script", () => {
    expect(CONTENT_AGENT_TOOL_REGISTRY.create_carousel.requiresScript).toBe(true);
    expect(CONTENT_AGENT_TOOL_REGISTRY.save_script.requiresScript).toBe(true);
    expect(CONTENT_AGENT_TOOL_REGISTRY.schedule_filming.requiresScript).toBe(true);
    expect(CONTENT_AGENT_TOOL_REGISTRY.write_viral_script.requiresScript).toBe(false);
    expect(CONTENT_AGENT_TOOL_REGISTRY.remake_social_video.requiresScript).toBe(false);
  });
});

describe("SpyReels Content Agent deterministic routing", () => {
  it("routes Instagram links to the remake job", () => {
    const action = resolveContentAgentIntentRules({
      message: "Remake this for restaurant owners https://www.instagram.com/reel/ABC123/",
    });

    expect(action.tool).toBe("remake_social_video");
    expect(action.platform).toBe("instagram");
    expect(action.sourceUrl).toContain("instagram.com/reel/ABC123");
    expect(action.confidence).toBeGreaterThanOrEqual(95);
  });

  it("detects TikTok and YouTube sources", () => {
    expect(extractSocialSource("https://www.tiktok.com/@creator/video/123")?.platform).toBe(
      "tiktok"
    );
    expect(extractSocialSource("https://youtube.com/shorts/abc123")?.platform).toBe(
      "youtube"
    );
  });

  it("routes a pasted full script to convert_existing_script", () => {
    const longScript = Array.from({ length: 95 }, (_, index) => `word${index + 1}`).join(" ");

    expect(looksLikeExistingScript(longScript)).toBe(true);
    expect(resolveContentAgentIntentRules({ message: longScript }).tool).toBe(
      "convert_existing_script"
    );
  });

  it("routes artifact actions against the current Reel", () => {
    const base = { activeScriptId: 42 };

    expect(resolveContentAgentIntentRules({ ...base, message: "save this" }).tool).toBe(
      "save_script"
    );
    expect(
      resolveContentAgentIntentRules({ ...base, message: "schedule filming Friday at 10 am" }).tool
    ).toBe("schedule_filming");
    expect(
      resolveContentAgentIntentRules({ ...base, message: "turn this into a carousel" }).tool
    ).toBe("create_carousel");
    expect(resolveContentAgentIntentRules({ ...base, message: "download this" }).tool).toBe(
      "download_script"
    );
    expect(resolveContentAgentIntentRules({ ...base, message: "check script health" }).tool).toBe(
      "inspect_script_health"
    );
  });

  it("normalizes common refine requests", () => {
    const action = resolveContentAgentIntentRules({
      activeScriptId: 9,
      message: "make it shorter",
    });

    expect(action.tool).toBe("refine_script");
    expect(action.scriptId).toBe(9);
    expect(action.refineInstruction).toContain("Shorten the full script");
  });

  it("uses the LLM classifier only for ambiguous turns", () => {
    const currentArtifact = resolveContentAgentIntentRules({
      activeScriptId: 9,
      message: "make this feel more premium but keep my point",
    });
    const newIdea = resolveContentAgentIntentRules({
      message: "restaurant pricing psychology",
    });

    expect(currentArtifact.tool).toBe("refine_script");
    expect(shouldUseLlmContentAgentClassifier(currentArtifact)).toBe(true);
    expect(newIdea.tool).toBe("write_viral_script");
    expect(shouldUseLlmContentAgentClassifier(newIdea)).toBe(true);
  });
});
