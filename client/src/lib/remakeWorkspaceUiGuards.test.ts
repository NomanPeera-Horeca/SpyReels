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

describe("Remake workspace persistence + dismiss contract", () => {
  it("hydrates saved B-roll on open and does not dismiss on outside click", () => {
    expect(workspaceSource).toContain("getBrollGeneration");
    expect(workspaceSource).toContain("brollHydratedScriptId");
    expect(workspaceSource).toContain("onPointerDownOutside");
    expect(workspaceSource).toContain("onInteractOutside");
    expect(workspaceSource).toContain("onEscapeKeyDown");
    expect(workspaceSource).toContain("event.preventDefault()");
  });

  it("persists Opening Hook / Frame0 on the Remake script", () => {
    expect(workspaceSource).toContain("frame0OnScreenText");
    expect(workspaceSource).toContain("frame0Text");
    expect(workspaceSource).toContain("onTextChange={setFrame0Text}");
  });
});

describe("Quiet card remake CTA contract", () => {
  const oneClickSource = readFileSync(
    resolve(__dirname, "./oneClickRemakeAction.ts"),
    "utf8"
  );

  it("opens existing remake work instead of a fresh Remake CTA", () => {
    expect(oneClickSource).toContain(
      "Any prior remake artifact: open the durable workspace"
    );
    expect(oneClickSource).toContain("args.batchEntry?.latestScriptId");
    expect(oneClickSource).toContain("READY_TO_FILM_CTA_LABEL");
  });
});

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

  it("uses the shared Figma Result Card, whose Remake is the soft (not filled purple) button", () => {
    expect(cardSource).toContain('from "@/design-system/ResultCard"');
    expect(cardSource).toContain("<ResultCard");
    expect(cardSource).not.toContain("Remake in your voice");
    expect(cardSource).not.toMatch(/#[0-9a-fA-F]{6}/);
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

  it("the creator is the approved brand link (Figma 288:666 Creator link) and opens in-app", () => {
    expect(cardSource).toContain("onOpenCreator={");
    expect(cardSource).not.toContain("viralPostCreatorProfileUrl");
  });

  it("page chrome uses Figma variables only: no hard-coded colors, tabs are not filled purple", () => {
    expect(viralLegacySource).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(viralLegacySource).toContain("vp.tabActive");
    expect(viralLegacySource).not.toMatch(
      /aria-selected=\{tab === id\}[\s\S]{0,200}bg-primary/
    );
  });
});
