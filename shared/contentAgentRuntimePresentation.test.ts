import { describe, expect, it } from "vitest";
import {
  contentAgentResultTurn,
  contentAgentWorkingLabel,
} from "./contentAgentRuntimePresentation";
import type { ContentAgentAction } from "./contentAgentTools";

const saveAction: ContentAgentAction = {
  tool: "save_script",
  confidence: 100,
  source: "rule",
  scriptId: 12,
};

describe("contentAgentRuntimePresentation", () => {
  it("uses an action receipt only after a completed action", () => {
    const turn = contentAgentResultTurn("1", saveAction, {
      status: "completed",
      detail: "Restaurant pricing Reel",
    });

    expect(turn.kind).toBe("action_receipt");
    expect(turn.text).toBe("Saved to My Scripts");
    expect(turn.detail).toBe("Restaurant pricing Reel");
  });

  it("uses a truthful started receipt for a handoff action", () => {
    const turn = contentAgentResultTurn(
      "started",
      {
        tool: "create_carousel",
        confidence: 100,
        source: "rule",
        scriptId: 12,
      },
      { status: "started" }
    );

    expect(turn.kind).toBe("action_receipt");
    expect(turn.text).toBe("Opening Carousel Studio");
  });

  it("turns missing input into a conversational clarification", () => {
    const turn = contentAgentResultTurn(
      "2",
      {
        tool: "schedule_filming",
        confidence: 100,
        source: "rule",
        scriptId: 12,
      },
      {
        status: "requires_input",
        message: "When do you want to film this Reel?",
      }
    );

    expect(turn.kind).toBe("clarification");
    expect(turn.text).toBe("When do you want to film this Reel?");
  });

  it("never presents a failed action as success", () => {
    const turn = contentAgentResultTurn("3", saveAction, {
      status: "failed",
      message: "Could not save this Reel.",
    });

    expect(turn.kind).toBe("error");
    expect(turn.text).toBe("Could not save this Reel.");
  });

  it("uses the resolved action status as the working label", () => {
    expect(
      contentAgentWorkingLabel({
        tool: "create_carousel",
        confidence: 98,
        source: "rule",
        scriptId: 12,
        assistantMessage: "Turning your current Reel into a carousel.",
      })
    ).toBe("Turning your current Reel into a carousel.");
  });
});
