import { describe, expect, it, vi } from "vitest";
import {
  ContentAgentExecutionError,
  contentAgentActionForButton,
  executeContentAgentAction,
  type ContentAgentExecutorDeps,
} from "./contentAgentExecutor";
import type { ContentAgentAction } from "./contentAgentTools";

function deps() {
  const completed = async () => ({ status: "completed" as const });
  return {
    writeViralScript: vi.fn(completed),
    refineScript: vi.fn(completed),
    generateHookIdeas: vi.fn(completed),
    loadPlanCard: vi.fn(completed),
    remakeSocialVideo: vi.fn(completed),
    convertExistingScript: vi.fn(completed),
    createCarousel: vi.fn(completed),
    saveScript: vi.fn(completed),
    scheduleFilming: vi.fn(completed),
    downloadScript: vi.fn(completed),
    inspectScriptHealth: vi.fn(completed),
  } satisfies ContentAgentExecutorDeps;
}

describe("Content Agent executor", () => {
  it.each([
    ["write_viral_script", "writeViralScript"],
    ["refine_script", "refineScript"],
    ["generate_hook_ideas", "generateHookIdeas"],
    ["load_plan_card", "loadPlanCard"],
    ["remake_social_video", "remakeSocialVideo"],
    ["convert_existing_script", "convertExistingScript"],
    ["create_carousel", "createCarousel"],
    ["save_script", "saveScript"],
    ["schedule_filming", "scheduleFilming"],
    ["download_script", "downloadScript"],
    ["inspect_script_health", "inspectScriptHealth"],
  ] as const)("dispatches %s through one executor", async (tool, handler) => {
    const d = deps();
    const action: ContentAgentAction = {
      tool,
      confidence: 100,
      source: "rule",
      scriptId:
        tool === "write_viral_script" ||
        tool === "load_plan_card" ||
        tool === "convert_existing_script" ||
        tool === "remake_social_video"
          ? undefined
          : 42,
      sourceUrl:
        tool === "remake_social_video"
          ? "https://www.instagram.com/reel/example/"
          : undefined,
    };

    await executeContentAgentAction(action, d);

    expect(d[handler]).toHaveBeenCalledTimes(1);
    expect(d[handler]).toHaveBeenCalledWith(action, {});
  });

  it("preserves raw creator input for workflows that need the original message", async () => {
    const d = deps();
    const action: ContentAgentAction = {
      tool: "convert_existing_script",
      confidence: 96,
      source: "rule",
    };
    const inputText = "This is the full pasted creator script that must survive intent routing.";

    await executeContentAgentAction(action, d, { inputText });

    expect(d.convertExistingScript).toHaveBeenCalledWith(action, { inputText });
  });

  it("blocks script-required tools without a current script", async () => {
    const d = deps();
    await expect(
      executeContentAgentAction(
        { tool: "save_script", confidence: 100, source: "rule" },
        d
      )
    ).rejects.toBeInstanceOf(ContentAgentExecutionError);
    expect(d.saveScript).not.toHaveBeenCalled();
  });

  it("asks for a Remake source URL instead of treating missing input as failure", async () => {
    const d = deps();
    const result = await executeContentAgentAction(
      { tool: "remake_social_video", confidence: 100, source: "rule" },
      d
    );

    expect(result).toEqual({
      status: "requires_input",
      message: "Paste the Instagram, TikTok, or YouTube link you want me to remake.",
    });
    expect(d.remakeSocialVideo).not.toHaveBeenCalled();
  });

  it("builds button actions using the same action shape as chat", () => {
    expect(contentAgentActionForButton("save_script", { scriptId: 77 })).toMatchObject({
      tool: "save_script",
      scriptId: 77,
      confidence: 100,
      source: "rule",
    });

    expect(
      contentAgentActionForButton("schedule_filming", {
        scriptId: 77,
        scheduleText: "Friday at 10 AM",
      })
    ).toMatchObject({
      tool: "schedule_filming",
      scriptId: 77,
      scheduleText: "Friday at 10 AM",
    });
  });
});
