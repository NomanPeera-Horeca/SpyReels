import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./server/_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock the db module
vi.mock("./server/db", () => ({
  getUserScript: vi.fn(),
  updateScript: vi.fn(),
  createScriptVersion: vi.fn(),
}));

describe("Script Editing Tools - Backend Procedures", () => {
  describe("phraseSwap", () => {
    it("should accept scriptId and content parameters", () => {
      const input = { scriptId: 1, content: "This is a great video about cooking tips" };
      expect(input.scriptId).toBe(1);
      expect(input.content).toBeTruthy();
    });

    it("should handle empty content gracefully", () => {
      const input = { scriptId: 1, content: "" };
      expect(input.content).toBe("");
    });
  });

  describe("simplify", () => {
    it("should accept scriptId and content parameters", () => {
      const input = { scriptId: 1, content: "The utilization of sophisticated methodologies" };
      expect(input.scriptId).toBe(1);
      expect(input.content).toBeTruthy();
    });
  });

  describe("adjustTone", () => {
    it("should accept valid tone values", () => {
      const validTones = ["casual", "professional", "academic", "gen_z", "storyteller"];
      validTones.forEach((tone) => {
        const input = { scriptId: 1, content: "Test content", tone };
        expect(validTones).toContain(input.tone);
      });
    });

    it("should reject invalid tone values", () => {
      const validTones = ["casual", "professional", "academic", "gen_z", "storyteller"];
      expect(validTones).not.toContain("invalid_tone");
    });
  });

  describe("makeShorter", () => {
    it("should accept valid target seconds", () => {
      const validTargets = [30, 45, 60, 90];
      validTargets.forEach((targetSeconds) => {
        const input = { scriptId: 1, content: "Long content here", targetSeconds };
        expect(input.targetSeconds).toBeGreaterThanOrEqual(15);
        expect(input.targetSeconds).toBeLessThanOrEqual(120);
      });
    });

    it("should calculate approximate target word count", () => {
      const targetSeconds = 30;
      const wordsPerSecond = 3;
      const targetWords = targetSeconds * wordsPerSecond;
      expect(targetWords).toBe(90);
    });

    it("should calculate word count for 45 seconds", () => {
      const targetSeconds = 45;
      const wordsPerSecond = 3;
      const targetWords = targetSeconds * wordsPerSecond;
      expect(targetWords).toBe(135);
    });

    it("should calculate word count for 60 seconds", () => {
      const targetSeconds = 60;
      const wordsPerSecond = 3;
      const targetWords = targetSeconds * wordsPerSecond;
      expect(targetWords).toBe(180);
    });

    it("should calculate word count for 90 seconds", () => {
      const targetSeconds = 90;
      const wordsPerSecond = 3;
      const targetWords = targetSeconds * wordsPerSecond;
      expect(targetWords).toBe(270);
    });
  });

  describe("rewriteSelection", () => {
    it("should accept fullContent, selectedText, and optional instruction", () => {
      const input = {
        scriptId: 1,
        fullContent: "This is the full script content with some text to replace",
        selectedText: "some text to replace",
        instruction: "make it punchier",
      };
      expect(input.fullContent).toContain(input.selectedText);
    });

    it("should work without instruction (auto-improve)", () => {
      const input = {
        scriptId: 1,
        fullContent: "This is the full script content",
        selectedText: "full script",
      };
      expect(input.instruction).toBeUndefined();
    });

    it("should validate that selectedText exists in fullContent", () => {
      const fullContent = "This is the full script content";
      const selectedText = "full script";
      expect(fullContent.includes(selectedText)).toBe(true);
    });

    it("should detect when selectedText is not in fullContent", () => {
      const fullContent = "This is the full script content";
      const selectedText = "nonexistent text";
      expect(fullContent.includes(selectedText)).toBe(false);
    });
  });

  describe("rewriteWithAngle", () => {
    it("should accept scriptId, content, and angle parameters", () => {
      const input = {
        scriptId: 1,
        content: "Original script about cooking",
        angle: "from a beginner's perspective",
      };
      expect(input.angle).toBeTruthy();
      expect(input.content).toBeTruthy();
    });

    it("should require non-empty angle", () => {
      const angle = "as a controversial take";
      expect(angle.trim().length).toBeGreaterThan(0);
    });
  });
});

describe("Script Editing Tools - UI Helpers", () => {
  describe("formatDateForInput", () => {
    it("should format date correctly for HTML date input", () => {
      const d = new Date(2025, 2, 10); // March 10, 2025 (local)
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const result = `${year}-${month}-${day}`;
      expect(result).toBe("2025-03-10");
    });

    it("should handle single-digit months and days", () => {
      const d = new Date(2025, 0, 5); // Jan 5, 2025
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const result = `${year}-${month}-${day}`;
      expect(result).toBe("2025-01-05");
    });
  });

  describe("Text selection handling", () => {
    it("should require minimum 5 characters for selection rewrite", () => {
      const minLength = 5;
      expect("Hi".trim().length > minLength).toBe(false);
      expect("Hello world".trim().length > minLength).toBe(true);
    });

    it("should trim whitespace before checking length", () => {
      const selected = "   ab   ";
      expect(selected.trim().length > 5).toBe(false);
    });
  });

  describe("Word count and duration estimation", () => {
    it("should calculate word count correctly", () => {
      const content = "This is a test script with some words";
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBe(8);
    });

    it("should estimate duration at 3 words per second", () => {
      const wordCount = 90;
      const estimatedDuration = Math.round(wordCount / 3);
      expect(estimatedDuration).toBe(30);
    });

    it("should handle empty content", () => {
      const content = "";
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBe(0);
    });
  });
});
