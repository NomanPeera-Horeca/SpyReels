/**
 * Live verification: remake → Studio import returns immediately; production fills in background.
 *
 * Run: STRIPE_SECRET_KEY=sk_test_dummy pnpm exec tsx scripts/test-remake-studio-import.ts
 * Fail: SPYREELS_TEST_FORCE_REMAKE_PRODUCTION_FAIL=1 ... --fail-only
 */
import "dotenv/config";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  coachScripts,
  featuredReels,
  recreatedScripts,
  reels,
  tiktokVideos,
  youtubeVideos,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { importRemakeScriptToStudioForWorkspace } from "../server/importRemakeToStudio";
import { buildCoachSectionsFromRemakeScript } from "../shared/remakeStudioImport";

type PlatformCase = {
  label: "Instagram Reel" | "TikTok video" | "YouTube Short";
  remakeId: number;
  userId: number;
  workspaceId: string;
  script: string;
  caption: string | null;
  handle: string | null;
};

async function loadCases(): Promise<PlatformCase[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [igRow] = await db
    .select({
      id: recreatedScripts.id,
      userId: recreatedScripts.userId,
      workspaceId: recreatedScripts.workspaceId,
      script: recreatedScripts.generatedScript,
      reelCaption: reels.caption,
      featuredCaption: featuredReels.caption,
      reelHandle: reels.ownerUsername,
    })
    .from(recreatedScripts)
    .leftJoin(reels, eq(recreatedScripts.reelId, reels.id))
    .leftJoin(featuredReels, eq(recreatedScripts.featuredReelId, featuredReels.id))
    .where(
      and(
        eq(recreatedScripts.status, "completed"),
        isNotNull(recreatedScripts.generatedScript),
        sql`(${recreatedScripts.reelId} IS NOT NULL OR ${recreatedScripts.featuredReelId} IS NOT NULL)`
      )
    )
    .orderBy(desc(recreatedScripts.id))
    .limit(1);

  const [ttRow] = await db
    .select({
      id: recreatedScripts.id,
      userId: recreatedScripts.userId,
      workspaceId: recreatedScripts.workspaceId,
      script: recreatedScripts.generatedScript,
      caption: tiktokVideos.caption,
      handle: tiktokVideos.ownerUsername,
    })
    .from(recreatedScripts)
    .innerJoin(tiktokVideos, eq(recreatedScripts.tiktokVideoId, tiktokVideos.id))
    .where(
      and(
        eq(recreatedScripts.status, "completed"),
        isNotNull(recreatedScripts.generatedScript),
        isNotNull(recreatedScripts.tiktokVideoId)
      )
    )
    .orderBy(desc(recreatedScripts.id))
    .limit(1);

  const [ytRow] = await db
    .select({
      id: recreatedScripts.id,
      userId: recreatedScripts.userId,
      workspaceId: recreatedScripts.workspaceId,
      script: recreatedScripts.generatedScript,
      caption: youtubeVideos.description,
      title: youtubeVideos.title,
      handle: youtubeVideos.ownerHandle,
    })
    .from(recreatedScripts)
    .innerJoin(youtubeVideos, eq(recreatedScripts.youtubeVideoId, youtubeVideos.id))
    .where(
      and(
        eq(recreatedScripts.status, "completed"),
        isNotNull(recreatedScripts.generatedScript),
        isNotNull(recreatedScripts.youtubeVideoId)
      )
    )
    .orderBy(desc(recreatedScripts.id))
    .limit(1);

  const cases: PlatformCase[] = [];
  if (igRow?.script) {
    cases.push({
      label: "Instagram Reel",
      remakeId: igRow.id,
      userId: igRow.userId,
      workspaceId: igRow.workspaceId,
      script: igRow.script,
      caption: igRow.reelCaption ?? igRow.featuredCaption,
      handle: igRow.reelHandle,
    });
  }
  if (ttRow?.script) {
    cases.push({
      label: "TikTok video",
      remakeId: ttRow.id,
      userId: ttRow.userId,
      workspaceId: ttRow.workspaceId,
      script: ttRow.script,
      caption: ttRow.caption,
      handle: ttRow.handle,
    });
  }
  if (ytRow?.script) {
    cases.push({
      label: "YouTube Short",
      remakeId: ytRow.id,
      userId: ytRow.userId,
      workspaceId: ytRow.workspaceId,
      script: ytRow.script,
      caption: ytRow.caption || ytRow.title,
      handle: ytRow.handle,
    });
  }
  return cases;
}

async function loadCoachRow(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, id)).limit(1);
  if (!row) throw new Error(`coach_scripts ${id} not found`);
  return row;
}

function assertProductionPopulated(notesJson: string | null, label: string) {
  if (!notesJson) throw new Error(`${label}: productionNotes missing`);
  const notes = JSON.parse(notesJson) as Record<string, unknown>;
  for (const key of ["hookVisualBeat", "hookOnScreenText", "setup", "voiceTone", "bRoll"] as const) {
    const val = notes[key];
    if (val == null || val === "" || (Array.isArray(val) && val.length === 0)) {
      throw new Error(`${label}: ${key} empty or missing`);
    }
  }
  const musicOk =
    (typeof notes.music === "string" && notes.music.trim().length > 0) ||
    (Array.isArray(notes.instagramAudio) && notes.instagramAudio.length > 0);
  if (!musicOk) throw new Error(`${label}: music/instagramAudio empty`);
  return notes;
}

async function waitForTerminalStatus(scriptId: number, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await loadCoachRow(scriptId);
    if (row.productionNotesStatus === "completed" || row.productionNotesStatus === "failed") {
      return row;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for productionNotesStatus on coach_scripts.${scriptId}`);
}

async function runImport(c: PlatformCase) {
  const before = buildCoachSectionsFromRemakeScript(c.script);
  console.log(`\n======== ${c.label} (recreated_scripts.id=${c.remakeId}) ========`);

  const started = Date.now();
  const result = await importRemakeScriptToStudioForWorkspace({
    userId: c.userId,
    workspaceId: c.workspaceId,
    flatScript: c.script,
    title: `TEST async remake import ${c.label}`,
    sourceHandle: c.handle ?? undefined,
    sourceCaption: c.caption ?? undefined,
    platformLabel: c.label,
  });
  const importMs = Date.now() - started;

  console.log(`import returned in ${importMs}ms coach_scripts.id=${result.id}`);
  console.log("IMMEDIATE row (after import return):");
  const immediate = await loadCoachRow(result.id);
  console.log(
    JSON.stringify(
      {
        id: immediate.id,
        productionNotesStatus: immediate.productionNotesStatus,
        hook: immediate.hook,
        bodyPreview: immediate.body.slice(0, 120),
        callToAction: immediate.callToAction,
        productionNotesPreview: (immediate.productionNotes ?? "").slice(0, 200),
        hasHookVisualBeat: Boolean(
          JSON.parse(immediate.productionNotes || "{}").hookVisualBeat
        ),
      },
      null,
      2
    )
  );

  if (importMs > 5000) {
    console.warn(
      `WARNING: import took ${importMs}ms (expected fast, LLM should not block return)`
    );
  }
  if (immediate.productionNotesStatus !== "processing") {
    throw new Error(`Expected processing immediately, got ${immediate.productionNotesStatus}`);
  }
  if (!immediate.hook?.trim() || !immediate.body?.trim()) {
    throw new Error("Script text missing immediately after import");
  }

  const spokenBefore = {
    hook: immediate.hook,
    body: immediate.body,
    callToAction: immediate.callToAction,
  };

  console.log("Waiting for background production...");
  const finalRow = await waitForTerminalStatus(result.id);
  console.log(`AFTER background: status=${finalRow.productionNotesStatus}`);
  console.log("productionNotes JSON:");
  console.log(finalRow.productionNotes);

  if (finalRow.productionNotesStatus !== "completed") {
    throw new Error(`Expected completed, got ${finalRow.productionNotesStatus}`);
  }
  assertProductionPopulated(finalRow.productionNotes, c.label);

  if (
    finalRow.hook !== spokenBefore.hook ||
    finalRow.body !== spokenBefore.body ||
    finalRow.callToAction !== spokenBefore.callToAction
  ) {
    throw new Error(`${c.label}: spoken script changed during background production`);
  }
  if (
    finalRow.hook !== (before.hook || c.script.trim().slice(0, 500)) ||
    finalRow.body !== before.body ||
    finalRow.callToAction !== before.callToAction
  ) {
    throw new Error(`${c.label}: spoken script differs from remake split`);
  }

  console.log(`OK ${c.label}: importMs=${importMs}, spoken unchanged, production filled`);
}

async function runFailOnly() {
  const cases = await loadCases();
  if (cases.length === 0) throw new Error("No remake scripts found");
  const c = cases[0]!;
  console.log(
    `\n======== FORCE FAIL production (${c.label}, remake ${c.remakeId}) ========`
  );
  const result = await importRemakeScriptToStudioForWorkspace({
    userId: c.userId,
    workspaceId: c.workspaceId,
    flatScript: c.script,
    title: "TEST async remake import FORCE FAIL",
    sourceHandle: c.handle ?? undefined,
    sourceCaption: c.caption ?? undefined,
    platformLabel: c.label,
  });
  const immediate = await loadCoachRow(result.id);
  console.log("IMMEDIATE:", {
    id: immediate.id,
    status: immediate.productionNotesStatus,
    hookLen: immediate.hook.length,
  });
  const finalRow = await waitForTerminalStatus(result.id, 30_000);
  console.log("AFTER fail:", {
    id: finalRow.id,
    status: finalRow.productionNotesStatus,
    hasHookVisualBeat: Boolean(JSON.parse(finalRow.productionNotes || "{}").hookVisualBeat),
    hook: finalRow.hook.slice(0, 80),
  });
  if (finalRow.productionNotesStatus !== "failed") {
    throw new Error(`Expected failed, got ${finalRow.productionNotesStatus}`);
  }
  if (finalRow.hook !== immediate.hook || finalRow.body !== immediate.body) {
    throw new Error("Script changed on fail path");
  }
  console.log("Fail path OK: status=failed, script intact, placeholders expected in UI");
}

async function main() {
  const failOnly = process.argv.includes("--fail-only");
  if (failOnly) {
    if (process.env.SPYREELS_TEST_FORCE_REMAKE_PRODUCTION_FAIL !== "1") {
      throw new Error(
        "Set SPYREELS_TEST_FORCE_REMAKE_PRODUCTION_FAIL=1 with --fail-only"
      );
    }
    await runFailOnly();
    return;
  }

  const cases = await loadCases();
  console.log(
    "Loaded cases:",
    cases.map((c) => `${c.label}#${c.remakeId}`).join(", ") || "(none)"
  );
  for (const c of cases) {
    await runImport(c);
  }
}

main()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
