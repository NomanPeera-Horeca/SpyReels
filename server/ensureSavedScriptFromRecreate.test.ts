import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  createSavedScript: vi.fn(),
  createScriptVersion: vi.fn(),
  ensureDefaultTags: vi.fn(),
  getLatestVersionNumber: vi.fn(),
  getSavedScriptIdForRecreated: vi.fn(),
  getSavedScriptIdForReel: vi.fn(),
  updateSavedScript: vi.fn(),
}));

import {
  createSavedScript,
  createScriptVersion,
  ensureDefaultTags,
  getLatestVersionNumber,
  getSavedScriptIdForRecreated,
  getSavedScriptIdForReel,
  updateSavedScript,
} from "./db";
import {
  ensureSavedScriptFromRecreate,
  isDuplicateSavedScriptReelError,
} from "./ensureSavedScriptFromRecreate";

const workspaceId = "ws-1";
const userId = 9;

function completedRemake(overrides: Partial<{
  id: number;
  generatedScript: string;
  topic: string;
  gradeLevel: string;
  reelId: number | null;
}> = {}) {
  return {
    id: overrides.id ?? 387,
    status: "completed",
    generatedScript: overrides.generatedScript ?? "Hook line.\n\nBody of the remake script.",
    topic: overrides.topic ?? "Personalized",
    gradeLevel: overrides.gradeLevel ?? "auto",
    reelId: overrides.reelId === undefined ? 44623 : overrides.reelId,
  };
}

describe("isDuplicateSavedScriptReelError", () => {
  it("detects the workspace-user-reel unique index", () => {
    expect(
      isDuplicateSavedScriptReelError({
        cause: {
          code: "ER_DUP_ENTRY",
          sqlMessage:
            "Duplicate entry 'ws-1-9-44623' for key 'saved_scripts.uniq_saved_scripts_workspace_user_reel'",
        },
      })
    ).toBe(true);
  });

  it("ignores other duplicate keys", () => {
    expect(
      isDuplicateSavedScriptReelError({
        cause: {
          code: "ER_DUP_ENTRY",
          sqlMessage: "Duplicate entry 'x' for key 'saved_scripts.uniq_saved_scripts_workspace_user_recreated'",
        },
      })
    ).toBe(false);
  });
});

describe("ensureSavedScriptFromRecreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ensureDefaultTags as any).mockResolvedValue(undefined);
    (createScriptVersion as any).mockResolvedValue(1);
    (updateSavedScript as any).mockResolvedValue(undefined);
    (getLatestVersionNumber as any).mockResolvedValue(1);
    (getSavedScriptIdForRecreated as any).mockResolvedValue(null);
    (getSavedScriptIdForReel as any).mockResolvedValue(null);
    (createSavedScript as any).mockResolvedValue(500);
  });

  it("returns existing row when this remake was already promoted", async () => {
    (getSavedScriptIdForRecreated as any).mockResolvedValue(386);
    const result = await ensureSavedScriptFromRecreate({
      workspaceId,
      userId,
      recreated: completedRemake(),
    });
    expect(result).toEqual({ id: 386, created: false, updated: false });
    expect(createSavedScript).not.toHaveBeenCalled();
    expect(updateSavedScript).not.toHaveBeenCalled();
  });

  it("upserts by reel on re-remake instead of inserting a duplicate", async () => {
    (getSavedScriptIdForReel as any).mockResolvedValue(386);
    const result = await ensureSavedScriptFromRecreate({
      workspaceId,
      userId,
      recreated: completedRemake({ id: 387 }),
    });
    expect(result).toEqual({ id: 386, created: false, updated: true });
    expect(createSavedScript).not.toHaveBeenCalled();
    expect(updateSavedScript).toHaveBeenCalledWith(
      386,
      expect.objectContaining({
        recreatedScriptId: 387,
        content: "Hook line.\n\nBody of the remake script.",
        gradeLevel: "auto",
      })
    );
    expect(createScriptVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptId: 386,
        versionNumber: 2,
        changeType: "ai_rewrite",
        changeDescription: "Re-remake from source reel",
      })
    );
  });

  it("creates a new saved script when no reel row exists", async () => {
    const result = await ensureSavedScriptFromRecreate({
      workspaceId,
      userId,
      recreated: completedRemake({ id: 390, reelId: 999 }),
    });
    expect(result).toEqual({ id: 500, created: true, updated: false });
    expect(createSavedScript).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        workspaceId,
        reelId: 999,
        recreatedScriptId: 390,
        title: "Remake script",
        status: "draft",
      })
    );
    expect(createScriptVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptId: 500,
        versionNumber: 1,
        changeType: "initial",
      })
    );
  });

  it("recovers from a reel unique-index race by upserting", async () => {
    (createSavedScript as any).mockRejectedValue({
      cause: {
        code: "ER_DUP_ENTRY",
        sqlMessage:
          "Duplicate entry 'ws-1-9-44623' for key 'saved_scripts.uniq_saved_scripts_workspace_user_reel'",
      },
    });
    (getSavedScriptIdForReel as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(386);

    const result = await ensureSavedScriptFromRecreate({
      workspaceId,
      userId,
      recreated: completedRemake({ id: 387 }),
    });
    expect(result).toEqual({ id: 386, created: false, updated: true });
    expect(updateSavedScript).toHaveBeenCalledWith(
      386,
      expect.objectContaining({ recreatedScriptId: 387 })
    );
  });

  it("rejects incomplete remakes", async () => {
    await expect(
      ensureSavedScriptFromRecreate({
        workspaceId,
        userId,
        recreated: { ...completedRemake(), status: "processing" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
