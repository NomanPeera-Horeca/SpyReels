import { describe, expect, it } from "vitest";
import {
  actionReceipt,
  clarificationTurn,
  errorTurn,
  formatCurrentArtifactContext,
  formatSourceContext,
  workSummaryLabel,
} from "./contentAgentConversation";

describe("Content Agent conversation helpers", () => {
  it("formats the current Reel context without noise", () => {
    expect(
      formatCurrentArtifactContext({
        kind: "reel",
        title: "Restaurant pricing",
        duration: "42 sec",
      })
    ).toBe("Reel · Restaurant pricing · 42 sec");
  });

  it("formats source context for social sources", () => {
    expect(formatSourceContext({ kind: "reel", sourceKind: "instagram" })).toBe(
      "Instagram Reel"
    );
    expect(formatSourceContext({ kind: "reel", sourceKind: "tiktok" })).toBe(
      "TikTok"
    );
    expect(formatSourceContext({ kind: "reel", sourceKind: "youtube" })).toBe(
      "YouTube Short"
    );
  });

  it("prefers an explicit source label", () => {
    expect(
      formatSourceContext({
        kind: "reel",
        sourceKind: "instagram",
        sourceLabel: "@creator Reel",
      })
    ).toBe("@creator Reel");
  });

  it("uses actual duration when known", () => {
    expect(workSummaryLabel(43.6)).toBe("Worked for 44s");
    expect(workSummaryLabel(null)).toBe("Agent work");
  });

  it("builds compact action receipts", () => {
    const turn = actionReceipt("save", "Saved to My Scripts", "This Reel is now in your library.");
    expect(turn.role).toBe("agent");
    expect(turn.kind).toBe("action_receipt");
    expect(turn.text).toBe("Saved to My Scripts");
  });

  it("builds clarification and recovery turns", () => {
    expect(clarificationTurn("q", "When do you want to film it?").kind).toBe(
      "clarification"
    );
    expect(errorTurn("e", "I could not access that Reel.").kind).toBe("error");
  });
});
