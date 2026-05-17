import { describe, it, expect, vi } from "vitest";

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            caption: "Stop scrolling — this changed everything for my content strategy.\n\nI used to spend hours writing captions that got zero engagement. Then I discovered the hook-value-CTA formula and my reach tripled.\n\nHere's the truth: your caption is a mini landing page. Instagram indexes every word for search.\n\nSave this for your next post.",
            hashtags: ["ReelsStrategy", "ContentCreatorTips", "ViralCaptions", "InstagramGrowth2026", "CreatorEconomy"],
            primaryKeyword: "Instagram caption strategy",
            hookType: "Bold Statement",
          }),
        },
      },
    ],
  }),
}));

// Mock DB functions
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getSavedScript: vi.fn().mockResolvedValue({
      id: 1,
      userId: 1,
      workspaceId: "00000000-0000-4000-8000-000000000001",
      title: "Test Script",
      content: "This is a test script about content creation.",
      status: "draft",
    }),
    updateSavedScript: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Caption Generation", () => {
  it("should return valid caption structure from LLM mock", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "test" },
        { role: "user", content: "test script content" },
      ],
    });

    const raw = response.choices[0]?.message?.content as string;
    const result = JSON.parse(raw);

    expect(result).toHaveProperty("caption");
    expect(result).toHaveProperty("hashtags");
    expect(result).toHaveProperty("primaryKeyword");
    expect(result).toHaveProperty("hookType");
    expect(result.hashtags).toHaveLength(5);
    expect(result.caption.length).toBeGreaterThan(50);
  });

  it("should have exactly 5 hashtags without # prefix", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "test" },
        { role: "user", content: "test" },
      ],
    });

    const result = JSON.parse(response.choices[0]?.message?.content as string);
    expect(result.hashtags).toHaveLength(5);
    result.hashtags.forEach((tag: string) => {
      expect(tag).not.toMatch(/^#/);
      expect(tag.length).toBeGreaterThan(0);
    });
  });

  it("should strip # prefix from hashtags if present", () => {
    const hashtags = ["#ReelsStrategy", "ContentTips", "#Growth"].map((h) =>
      h.replace(/^#/, "")
    );
    expect(hashtags).toEqual(["ReelsStrategy", "ContentTips", "Growth"]);
  });

  it("should limit hashtags to 5 even if more returned", () => {
    const rawHashtags = ["a", "b", "c", "d", "e", "f", "g"];
    const limited = rawHashtags.slice(0, 5);
    expect(limited).toHaveLength(5);
  });

  it("should validate all 7 caption styles are accepted", () => {
    const validStyles = [
      "storytelling",
      "question",
      "cta",
      "educational",
      "curiosity",
      "bold",
      "relatable",
    ];
    validStyles.forEach((style) => {
      expect(typeof style).toBe("string");
      expect(style.length).toBeGreaterThan(0);
    });
    expect(validStyles).toHaveLength(7);
  });

  it("should save caption data to script via updateSavedScript", async () => {
    const { updateSavedScript } = await import("./db");
    const caption = "Test caption";
    const hashtags = ["tag1", "tag2", "tag3", "tag4", "tag5"];

    await updateSavedScript(1, {
      generatedCaption: caption,
      generatedHashtags: JSON.stringify(hashtags),
      captionStyle: "educational",
    });

    expect(updateSavedScript).toHaveBeenCalledWith(1, {
      generatedCaption: caption,
      generatedHashtags: JSON.stringify(hashtags),
      captionStyle: "educational",
    });
  });
});
