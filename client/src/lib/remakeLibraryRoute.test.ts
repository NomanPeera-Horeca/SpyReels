import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasVoiceProfile,
  libraryRemakeKey,
  resolveLibraryIds,
  transcribeStatusInput,
} from "./libraryRemakeChainCore";
import { ingestUrlAndStartLibraryRemake } from "./ingestUrlAndStartLibraryRemake";
import { remakeSourceReferenceInput } from "./remakeSourceTranscript";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("library remake source", () => {
  const src = { source: "library" as const, libraryCandidateId: 31 };
  it("has its own key, status input, ids and source-drawer input", () => {
    expect(libraryRemakeKey(src)).toBe("library:31");
    expect(transcribeStatusInput(src, undefined, undefined)).toEqual({ libraryCandidateId: 31 });
    expect(resolveLibraryIds(src)).toEqual({ libraryCandidateId: 31 });
    expect(remakeSourceReferenceInput(src, null)).toEqual({ libraryCandidateId: 31 });
  });
});

describe("hasVoiceProfile (no niche re-ask)", () => {
  it("skips the niche question for new-onboarding creators", () => {
    expect(hasVoiceProfile({ hasCreatorProfile: true })).toBe(true);
  });
  it("still accepts the old onboarding fields", () => {
    expect(hasVoiceProfile({ businessDescription: "Fitness coach", targetAudience: "Busy dads" })).toBe(true);
  });
  it("asks only when the creator told us nothing", () => {
    expect(hasVoiceProfile({ hasCreatorProfile: false, businessDescription: "x", targetAudience: " " })).toBe(false);
    expect(hasVoiceProfile(null)).toBe(false);
  });
});

describe("ingestUrlAndStartLibraryRemake", () => {
  const deps = () => ({
    addByUrl: vi.fn(async () => ({ id: 5, duplicate: false })),
    fetchCollectedList: vi.fn(async () => [{ id: 5, status: "ready" }]),
    startRemake: vi.fn(),
    pollMs: 0,
  });

  it("starts a library video straight from the library, with no Collected Reels copy", async () => {
    const d = deps();
    const res = await ingestUrlAndStartLibraryRemake("https://www.tiktok.com/@a/video/1", {
      ...d,
      resolveLibraryCandidateId: async () => 31,
    });
    expect(d.addByUrl).not.toHaveBeenCalled();
    expect(d.startRemake).toHaveBeenCalledWith({ source: "library", libraryCandidateId: 31 }, undefined);
    expect(res).toMatchObject({ remakeKey: "library:31", collectedReelId: null });
  });

  it("keeps the Collected Reels path when the switch is off or the link is not in the library", async () => {
    for (const resolveLibraryCandidateId of [undefined, async () => null, async () => Promise.reject(new Error("x"))]) {
      const d = deps();
      const res = await ingestUrlAndStartLibraryRemake("https://www.instagram.com/reel/abc/", {
        ...d,
        resolveLibraryCandidateId,
      });
      expect(d.addByUrl).toHaveBeenCalledOnce();
      expect(d.startRemake).toHaveBeenCalledWith({ source: "collected", collectedReelId: 5 }, undefined);
      expect(res.collectedReelId).toBe(5);
    }
  });
});

describe("every Remake entry point uses the one remake chain", () => {
  // Library videos: may go straight from the library when the switch is on.
  const libraryEntries = {
    Home: "../components/home-v2/HomeV2Page.tsx",
    "Viral Posts": "../pages/ViralPostsLegacy.tsx",
    "Agent box": "../components/AiCoachCommandShell.tsx",
    Discovery: "../pages/Discovery.tsx",
  };
  for (const [name, path] of Object.entries(libraryEntries)) {
    it(`${name} opens the shared popup and can use the library route`, () => {
      const s = read(path);
      expect(s).toContain("useLibraryRemakeChain");
      expect(s).toContain("ingestUrlAndStartLibraryRemake");
      expect(s).toContain("resolveLibraryCandidateId");
    });
  }

  it("Home and Viral Posts no longer say 'Remake started' before anything started", () => {
    for (const path of [libraryEntries.Home, libraryEntries["Viral Posts"]]) {
      expect(read(path)).not.toContain('toast.success("Remake started"');
    }
  });

  // The creator's own copies: already theirs, they go direct.
  const directEntries = {
    "Platform research": "../pages/PlatformResearch.tsx",
    "Collected Reels": "../pages/CollectedReels.tsx",
    "Saved Reels": "../pages/SavedReels.tsx",
    Dashboard: "../pages/Dashboard.tsx",
    "Transcript tool": "../pages/TranscriptGeneratorLanding.tsx",
  };
  for (const [name, path] of Object.entries(directEntries)) {
    it(`${name} opens the shared popup and does not copy into Collected Reels`, () => {
      const s = read(path);
      expect(s).toContain("useLibraryRemakeChain");
      expect(s).not.toContain("ingestUrlAndStartLibraryRemake");
    });
  }

  it("the remake chain sends library videos to the library transcript and generate", () => {
    const hook = read("../hooks/useLibraryRemakeChain.ts");
    expect(hook).toContain('source.source === "library"');
    expect(hook).toContain("libraryCandidateId: source.libraryCandidateId");
  });
});
