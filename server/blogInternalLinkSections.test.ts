import { describe, expect, it } from "vitest";
import {
  appendRelatedGuidesIfMissing,
  buildRelatedGuidesSection,
  contentHasRelatedGuidesSection,
} from "../shared/blogInternalLinkSections";

describe("blogInternalLinkSections", () => {
  it("builds related guides with three links and feature CTA", () => {
    const section = buildRelatedGuidesSection("guide-spy-on-competitor-instagram-reels");
    expect(section).toContain("## Related guides");
    expect(section).toContain("/blog/guide-find-viral-reels-your-niche");
    expect(section).toContain("/features/viral-reel-finder");
    expect(section).toContain("try SpyReels free");
  });

  it("inserts related guides before FAQ when missing", () => {
    const content = "Intro\n\n## Frequently asked questions\n\n### Q?\n\nA.";
    const out = appendRelatedGuidesIfMissing(content, "guide-grow-instagram-reels-under-10k");
    expect(contentHasRelatedGuidesSection(out)).toBe(true);
    expect(out.indexOf("## Related guides")).toBeLessThan(out.indexOf("## Frequently asked questions"));
  });

  it("does not duplicate related guides section", () => {
    const content = "Body\n\n## Related guides\n\n- [Link](/blog/foo)\n\n## FAQ\n\n### Q?\n\nA.";
    const out = appendRelatedGuidesIfMissing(content, "guide-grow-instagram-reels-under-10k");
    expect(out).toBe(content);
  });
});
