import { describe, expect, it, vi } from "vitest";
import { executeContentAgentAction } from "@shared/contentAgentExecutor";
import type { ContentAgentAction } from "@shared/contentAgentTools";
import {
  createContentAgentStudioDeps,
  type ContentAgentStudioBindings,
} from "./contentAgentStudioDeps";

function bindings(): ContentAgentStudioBindings {
  return {
    createScript: vi.fn(async () => ({ id: 101, title: "New Reel" })),
    refineScript: vi.fn(async (id) => ({ id, title: "Updated Reel" })),
    generateHookIdeas: vi.fn(async () => undefined),
    loadPlanCard: vi.fn(async () => ({ title: "Plan idea" })),
    startRemake: vi.fn(async () => undefined),
    convertExistingScript: vi.fn(async () => ({ id: 202, title: "Converted" })),
    openCarousel: vi.fn(async () => undefined),
    saveScript: vi.fn(async () => ({ savedScriptId: 303, title: "Saved Reel" })),
    scheduleFilming: vi.fn(async () => ({ label: "Friday · 10:00 AM" })),
    downloadScript: vi.fn(async () => undefined),
    inspectScriptHealth: vi.fn(async () => undefined),
  };
}

function action(
  tool: ContentAgentAction["tool"],
  extra: Partial<ContentAgentAction> = {}
): ContentAgentAction {
  return {
    tool,
    confidence: 100,
    source: "rule",
    ...extra,
  };
}

describe("createContentAgentStudioDeps", () => {
  it("passes the creator's original idea to the existing script workflow", async () => {
    const b = bindings();
    const deps = createContentAgentStudioDeps(b);

    const result = await executeContentAgentAction(
      action("write_viral_script"),
      deps,
      { inputText: "Why restaurant menu pricing should start with contribution margin" }
    );

    expect(b.createScript).toHaveBeenCalledWith(
      "Why restaurant menu pricing should start with contribution margin",
      { planCardId: undefined }
    );
    expect(result).toMatchObject({
      status: "completed",
      message: "Reel created",
      artifact: { kind: "reel", id: 101 },
    });
  });

  it("does not lose a pasted script after intent routing", async () => {
    const b = bindings();
    const deps = createContentAgentStudioDeps(b);
    const pasted = "Here is a complete creator script with enough words to be converted safely.";

    const result = await executeContentAgentAction(
      action("convert_existing_script"),
      deps,
      { inputText: pasted }
    );

    expect(b.convertExistingScript).toHaveBeenCalledWith(pasted);
    expect(result.status).toBe("completed");
  });

  it("asks for the script when conversion has no real payload", async () => {
    const b = bindings();
    const deps = createContentAgentStudioDeps(b);

    const result = await executeContentAgentAction(
      action("convert_existing_script"),
      deps
    );

    expect(result).toEqual({
      status: "requires_input",
      message: "Paste the script you want me to convert.",
    });
    expect(b.convertExistingScript).not.toHaveBeenCalled();
  });

  it("uses the same schedule binding for a conversational schedule request", async () => {
    const b = bindings();
    const deps = createContentAgentStudioDeps(b);

    const result = await executeContentAgentAction(
      action("schedule_filming", {
        scriptId: 42,
        scheduleText: "Friday at 10am",
      }),
      deps
    );

    expect(b.scheduleFilming).toHaveBeenCalledWith(42, "Friday at 10am");
    expect(result).toEqual({
      status: "completed",
      message: "Filming reminder set",
      detail: "Friday · 10:00 AM",
    });
  });

  it("asks for filming time when the user only says schedule this", async () => {
    const b = bindings();
    const deps = createContentAgentStudioDeps(b);

    const result = await executeContentAgentAction(
      action("schedule_filming", {
        scriptId: 42,
        scheduleText: "schedule this",
      }),
      deps
    );

    expect(result).toEqual({
      status: "requires_input",
      message: "When do you want to film this Reel?",
    });
    expect(b.scheduleFilming).not.toHaveBeenCalled();
  });

  it("opens Carousel through the existing workflow instead of inventing a second generator", async () => {
    const b = bindings();
    const deps = createContentAgentStudioDeps(b);

    const result = await executeContentAgentAction(
      action("create_carousel", { scriptId: 42 }),
      deps
    );

    expect(b.openCarousel).toHaveBeenCalledWith(42);
    expect(result).toEqual({
      status: "started",
      message: "Opening Carousel Studio",
    });
  });
});
