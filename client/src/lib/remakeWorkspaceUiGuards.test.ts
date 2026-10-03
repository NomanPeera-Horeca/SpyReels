import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceSource = readFileSync(
  resolve(__dirname, "../components/RemakeWorkspaceDialogAgenticV2.tsx"),
  "utf8"
);
const viralLegacySource = readFileSync(
  resolve(__dirname, "../pages/ViralPostsLegacy.tsx"),
  "utf8"
);
const collectedSource = readFileSync(
  resolve(__dirname, "../pages/CollectedReels.tsx"),
  "utf8"
);
const ingestSource = readFileSync(
  resolve(__dirname, "./ingestUrlAndStartLibraryRemake.ts"),
  "utf8"
);
const chainHookSource = readFileSync(
  resolve(__dirname, "../hooks/useLibraryRemakeChain.ts"),
  "utf8"
);

describe("Remake workspace agent UI cleanup", () => {
  it("does not render the four large left-side quick-action boxes", () => {
    expect(workspaceSource).not.toMatch(/quickActions/);
    expect(workspaceSource).not.toMatch(/uppercase tracking-wide text-\[#777083\]">Improve</);
    expect(workspaceSource).not.toContain("Stronger hook");
    expect(workspaceSource).not.toContain('label: "Shorter"');
    expect(workspaceSource).not.toContain('label: "Easier to say"');
    expect(workspaceSource).not.toContain('label: "More casual"');
  });

  it("does not render the robotic agent explanation sentence", () => {
    expect(workspaceSource).not.toContain(
      "Tell me what to change. I work directly on the live result on the right."
    );
  });

  it("keeps the agent composer with a concise placeholder", () => {
    expect(workspaceSource).toContain("Ask SpyReels to improve this script...");
  });

  it("keeps right-side contextual script actions", () => {
    expect(workspaceSource).toContain("Improve script");
    expect(workspaceSource).toContain("Fix grammar");
    expect(workspaceSource).toContain("Make shorter");
  });

  it("wires Try again to the shared remake retry callback", () => {
    expect(workspaceSource).toContain("onRetryRemake");
    expect(workspaceSource).toContain("Try again");
    expect(chainHookSource).toContain("onRetryRemake");
  });
});

describe("Viral Posts remake path parity", () => {
  it("uses the shared ingest + library remake chain", () => {
    expect(viralLegacySource).toContain("ingestUrlAndStartLibraryRemake");
    expect(viralLegacySource).toContain("useLibraryRemakeChain");
    expect(viralLegacySource).toContain("startRemake");
    expect(ingestSource).toContain('source: "collected"');
    expect(ingestSource).toContain("deps.startRemake(source,");
    expect(ingestSource).toContain("media:");
    expect(viralLegacySource).toContain("buildRemakeIntentMedia");
    expect(chainHookSource).toContain("media: intentPrompt?.media ?? null");
    expect(chainHookSource).not.toContain("getPendingRemakeIntentMedia");
    expect(chainHookSource).not.toContain("setPendingRemakeIntentMedia");
  });

  it("Collected Reels still uses the same library remake chain", () => {
    expect(collectedSource).toContain("useLibraryRemakeChain");
    expect(collectedSource).toContain("startRemake");
    expect(collectedSource).toContain("retryRemake");
  });

  it("For You, Explore, and Saved remake actions share openRemake", () => {
    expect(viralLegacySource).toContain("onRemake: (post: ViralPost) => void openRemake(post)");
    expect(viralLegacySource).toContain('tab === "for-you"');
    expect(viralLegacySource).toContain('tab === "explore"');
    expect(viralLegacySource).toContain('tab === "saved"');
  });
});

describe("Viral Posts mature SaaS color contract", () => {
  const cardSource = readFileSync(
    resolve(__dirname, "../components/viral-posts/ViralPostCard.tsx"),
    "utf8"
  );
  const drawerSource = readFileSync(
    resolve(__dirname, "../components/viral-posts/ViralPostDetailsDrawer.tsx"),
    "utf8"
  );

  it("keeps card Remake soft (not filled primary purple)", () => {
    expect(cardSource).toMatch(/Remake\s*<\/Button>/);
    expect(cardSource).not.toContain("Remake in your voice");
    expect(cardSource).toContain('variant="outline"');
    expect(cardSource).not.toMatch(/Remake\s*<\/Button>[\s\S]{0,80}bg-\[#7c3aed\]/);
    expect(cardSource).not.toMatch(/Remake\s*<\/Button>[\s\S]{0,80}bg-primary/);
  });

  it("uses brand primary only on drawer Remake commit CTA", () => {
    expect(drawerSource).toMatch(/Remake\s*<\/Button>/);
    expect(drawerSource).not.toContain("Remake this post");
    expect(drawerSource).toContain("bg-primary");
    expect(drawerSource).toContain("Color contract");
  });

  it("opens creators in-app instead of Instagram/TikTok", () => {
    expect(cardSource).toContain("onOpenCreator");
    expect(cardSource).not.toContain("viralPostCreatorProfileUrl");
    expect(drawerSource).toContain("onOpenCreator");
    expect(drawerSource).not.toContain("viralPostCreatorProfileUrl");
    expect(viralLegacySource).toContain("openCreator");
    expect(viralLegacySource).toContain("pathForCreatorResearchJob");
    expect(viralLegacySource).toContain("timeframeDays: 30");
  });

  it("keeps creator links muted (not brand purple)", () => {
    expect(cardSource).toContain("text-[#a8a3b3]");
    expect(cardSource).not.toContain("text-[#9b6cff]");
    expect(cardSource).not.toContain("text-[#d7c7ff]");
    expect(drawerSource).not.toContain("text-[#9b6cff]");
  });

  it("emphasizes niche signal without purple", () => {
    expect(cardSource).toContain("text-[#e8e4f0]");
    expect(drawerSource).toContain("text-[#e8e4f0]");
  });

  it("keeps tab selection soft in the page chrome", () => {
    expect(viralLegacySource).toContain('bg-white/[0.08]');
    expect(viralLegacySource).not.toMatch(
      /aria-selected=\{tab === id\}[\s\S]{0,200}bg-\[#7c3aed\]/
    );
    expect(viralLegacySource).not.toMatch(
      /aria-selected=\{tab === id\}[\s\S]{0,200}bg-primary/
    );
  });
});
