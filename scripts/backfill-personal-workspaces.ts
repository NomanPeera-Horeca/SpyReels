/**
 * Phase 1 Step 4: Create a Personal workspace per user and backfill workspaceId.
 *
 * Requires DATABASE_URL (use staging shinkansen for Cursor runs; production is manual).
 *
 * Usage:
 *   npx tsx scripts/backfill-personal-workspaces.ts --dry-run
 *   npx tsx scripts/backfill-personal-workspaces.ts --real-run
 *   npx tsx scripts/backfill-personal-workspaces.ts --real-run --batch-size 50
 */

import * as dotenv from "dotenv";
import { randomUUID } from "crypto";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  collectedReels,
  recreatedScripts,
  reels,
  savedReels,
  savedScripts,
  scrapeJobs,
  scriptIdeas,
  scriptTagAssignments,
  scriptTags,
  scriptVersions,
  subscriptions,
  transcriptions,
  users,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import { getDb } from "../server/db";

dotenv.config();

type RunMode = "dry-run" | "real-run";

type TableStatKey =
  | "scrape_jobs"
  | "reels"
  | "saved_reels"
  | "saved_scripts"
  | "script_versions"
  | "script_tags"
  | "script_tag_assignments"
  | "script_ideas"
  | "recreated_scripts"
  | "collected_reels"
  | "transcriptions";

type Stats = {
  usersProcessed: number;
  usersSkippedExistingWorkspace: number;
  workspacesCreated: number;
  membersCreated: number;
  userErrors: number;
  tableUpdates: Record<TableStatKey, number>;
};

function emptyTableUpdates(): Record<TableStatKey, number> {
  return {
    scrape_jobs: 0,
    reels: 0,
    saved_reels: 0,
    saved_scripts: 0,
    script_versions: 0,
    script_tags: 0,
    script_tag_assignments: 0,
    script_ideas: 0,
    recreated_scripts: 0,
    collected_reels: 0,
    transcriptions: 0,
  };
}

function parseArgs(argv: string[]): { mode: RunMode; batchSize: number } {
  const args = argv.slice(2);
  let dryRun = false;
  let realRun = false;
  let batchSize = 100;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--real-run") realRun = true;
    else if (a === "--batch-size") {
      const n = Number(args[++i]);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error("--batch-size requires a positive integer");
      }
      batchSize = Math.floor(n);
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/backfill-personal-workspaces.ts --dry-run
  npx tsx scripts/backfill-personal-workspaces.ts --real-run [--batch-size N]`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (dryRun === realRun) {
    console.error(
      "You must pass exactly one of --dry-run or --real-run (prevents accidental writes)."
    );
    process.exit(1);
  }

  return { mode: dryRun ? "dry-run" : "real-run", batchSize };
}

function logDatabaseTarget(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const u = new URL(raw);
  console.log(`Database host: ${u.hostname}:${u.port || "3306"} (${u.pathname.replace(/^\//, "")})`);
}

function readAffectedRows(result: unknown): number {
  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && result[0] !== null) {
    return Number((result[0] as { affectedRows?: number }).affectedRows ?? 0);
  }
  if (result && typeof result === "object" && "affectedRows" in result) {
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }
  return 0;
}

async function countWhereUserIdNull(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  table: "scrape_jobs" | "saved_reels" | "saved_scripts" | "script_tags" | "script_ideas" | "recreated_scripts" | "collected_reels"
): Promise<number> {
  const map = {
    scrape_jobs: scrapeJobs,
    saved_reels: savedReels,
    saved_scripts: savedScripts,
    script_tags: scriptTags,
    script_ideas: scriptIdeas,
    recreated_scripts: recreatedScripts,
    collected_reels: collectedReels,
  } as const;
  const t = map[table];
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(t)
    .where(and(eq(t.userId, userId), isNull(t.workspaceId)));
  return Number(row?.c ?? 0);
}

async function countReelsForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number
): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(reels)
    .innerJoin(scrapeJobs, eq(reels.jobId, scrapeJobs.id))
    .where(and(eq(scrapeJobs.userId, userId), isNull(reels.workspaceId)));
  return Number(row?.c ?? 0);
}

async function countScriptVersionsForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number
): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(scriptVersions)
    .innerJoin(savedScripts, eq(scriptVersions.scriptId, savedScripts.id))
    .where(and(eq(savedScripts.userId, userId), isNull(scriptVersions.workspaceId)));
  return Number(row?.c ?? 0);
}

async function countTagAssignmentsForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number
): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(scriptTagAssignments)
    .innerJoin(savedScripts, eq(scriptTagAssignments.scriptId, savedScripts.id))
    .where(and(eq(savedScripts.userId, userId), isNull(scriptTagAssignments.workspaceId)));
  return Number(row?.c ?? 0);
}

async function resolveUserPlan(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number
): Promise<string> {
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return sub?.plan ?? "free";
}

async function processUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  mode: RunMode,
  stats: Stats
): Promise<void> {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.ownerUserId, userId), eq(workspaces.isPersonal, true)))
    .limit(1);

  let workspaceId: string;

  if (existing) {
    workspaceId = existing.id;
    stats.usersSkippedExistingWorkspace++;
  } else {
    workspaceId = randomUUID();
    if (mode === "real-run") {
      const plan = await resolveUserPlan(db, userId);
      await db.insert(workspaces).values({
        id: workspaceId,
        name: "Personal",
        ownerUserId: userId,
        plan,
        isPersonal: true,
        includedSeats: 1,
      });
      await db.insert(workspaceMembers).values({
        id: randomUUID(),
        workspaceId,
        userId,
        role: "owner",
      });
    }
    stats.workspacesCreated++;
    stats.membersCreated++;
  }

  const bump = (key: TableStatKey, n: number) => {
    stats.tableUpdates[key] += n;
  };

  if (mode === "dry-run") {
    bump("scrape_jobs", await countWhereUserIdNull(db, userId, "scrape_jobs"));
    bump("reels", await countReelsForUser(db, userId));
    bump("saved_reels", await countWhereUserIdNull(db, userId, "saved_reels"));
    bump("saved_scripts", await countWhereUserIdNull(db, userId, "saved_scripts"));
    bump("script_versions", await countScriptVersionsForUser(db, userId));
    bump("script_tags", await countWhereUserIdNull(db, userId, "script_tags"));
    bump("script_tag_assignments", await countTagAssignmentsForUser(db, userId));
    bump("script_ideas", await countWhereUserIdNull(db, userId, "script_ideas"));
    bump("recreated_scripts", await countWhereUserIdNull(db, userId, "recreated_scripts"));
    bump("collected_reels", await countWhereUserIdNull(db, userId, "collected_reels"));
    return;
  }

  const scrapeResult = await db
    .update(scrapeJobs)
    .set({ workspaceId })
    .where(and(eq(scrapeJobs.userId, userId), isNull(scrapeJobs.workspaceId)));
  bump("scrape_jobs", readAffectedRows(scrapeResult));

  const reelsResult = await db.execute(sql`
    UPDATE reels r
    INNER JOIN scrape_jobs j ON r.jobId = j.id
    SET r.workspaceId = ${workspaceId}
    WHERE j.userId = ${userId} AND r.workspaceId IS NULL
  `);
  bump("reels", readAffectedRows(reelsResult));

  const savedReelsResult = await db
    .update(savedReels)
    .set({ workspaceId })
    .where(and(eq(savedReels.userId, userId), isNull(savedReels.workspaceId)));
  bump("saved_reels", readAffectedRows(savedReelsResult));

  const savedScriptsResult = await db
    .update(savedScripts)
    .set({ workspaceId })
    .where(and(eq(savedScripts.userId, userId), isNull(savedScripts.workspaceId)));
  bump("saved_scripts", readAffectedRows(savedScriptsResult));

  const scriptVersionsResult = await db.execute(sql`
    UPDATE script_versions sv
    INNER JOIN saved_scripts ss ON sv.scriptId = ss.id
    SET sv.workspaceId = ${workspaceId}
    WHERE ss.userId = ${userId} AND sv.workspaceId IS NULL
  `);
  bump("script_versions", readAffectedRows(scriptVersionsResult));

  const scriptTagsResult = await db
    .update(scriptTags)
    .set({ workspaceId })
    .where(and(eq(scriptTags.userId, userId), isNull(scriptTags.workspaceId)));
  bump("script_tags", readAffectedRows(scriptTagsResult));

  const tagAssignmentsResult = await db.execute(sql`
    UPDATE script_tag_assignments sta
    INNER JOIN saved_scripts ss ON sta.scriptId = ss.id
    SET sta.workspaceId = ${workspaceId}
    WHERE ss.userId = ${userId} AND sta.workspaceId IS NULL
  `);
  bump("script_tag_assignments", readAffectedRows(tagAssignmentsResult));

  const scriptIdeasResult = await db
    .update(scriptIdeas)
    .set({ workspaceId })
    .where(and(eq(scriptIdeas.userId, userId), isNull(scriptIdeas.workspaceId)));
  bump("script_ideas", readAffectedRows(scriptIdeasResult));

  const recreatedResult = await db
    .update(recreatedScripts)
    .set({ workspaceId })
    .where(and(eq(recreatedScripts.userId, userId), isNull(recreatedScripts.workspaceId)));
  bump("recreated_scripts", readAffectedRows(recreatedResult));

  const collectedResult = await db
    .update(collectedReels)
    .set({ workspaceId })
    .where(and(eq(collectedReels.userId, userId), isNull(collectedReels.workspaceId)));
  bump("collected_reels", readAffectedRows(collectedResult));
}

async function backfillTranscriptions(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  mode: RunMode,
  stats: Stats
): Promise<void> {
  if (mode === "dry-run") {
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(transcriptions)
      .where(and(isNotNull(transcriptions.reelId), isNull(transcriptions.workspaceId)));
    stats.tableUpdates.transcriptions = Number(row?.c ?? 0);
    return;
  }

  const result = await db.execute(sql`
    UPDATE transcriptions t
    INNER JOIN reels r ON t.reelId = r.id
    SET t.workspaceId = r.workspaceId
    WHERE t.reelId IS NOT NULL
      AND t.workspaceId IS NULL
      AND r.workspaceId IS NOT NULL
  `);
  stats.tableUpdates.transcriptions = readAffectedRows(result);
}

function printSummary(mode: RunMode, stats: Stats): void {
  console.log("\n=== Summary ===");
  console.log(`Mode: ${mode}`);
  console.log(`Users processed: ${stats.usersProcessed}`);
  console.log(`Users already had personal workspace: ${stats.usersSkippedExistingWorkspace}`);
  console.log(`Workspaces ${mode === "dry-run" ? "to create" : "created"}: ${stats.workspacesCreated}`);
  console.log(`Members ${mode === "dry-run" ? "to create" : "created"}: ${stats.membersCreated}`);
  console.log(`User errors (logged, run continued): ${stats.userErrors}`);
  console.log("Rows updated per table:");
  for (const [table, count] of Object.entries(stats.tableUpdates)) {
    console.log(`  ${table}: ${count}`);
  }
}

async function main(): Promise<void> {
  const { mode, batchSize } = parseArgs(process.argv);
  logDatabaseTarget();

  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL missing or database unreachable.");

  const allUsers = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.id));

  console.log(`Found ${allUsers.length} users. Batch size: ${batchSize}. Mode: ${mode}`);

  const stats: Stats = {
    usersProcessed: 0,
    usersSkippedExistingWorkspace: 0,
    workspacesCreated: 0,
    membersCreated: 0,
    userErrors: 0,
    tableUpdates: emptyTableUpdates(),
  };

  let processedIndex = 0;
  for (let offset = 0; offset < allUsers.length; offset += batchSize) {
    const batch = allUsers.slice(offset, offset + batchSize);
    console.log(
      `Batch ${Math.floor(offset / batchSize) + 1}: users ${offset + 1}-${offset + batch.length} of ${allUsers.length}`
    );

    for (const row of batch) {
      const userId = row.id;
      try {
        await processUser(db, userId, mode, stats);
        stats.usersProcessed++;
      } catch (err) {
        stats.userErrors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[user ${userId}] ERROR: ${msg}`);
      }

      processedIndex++;
      if (processedIndex % 25 === 0 || processedIndex === allUsers.length) {
        console.log(
          `Progress: ${processedIndex}/${allUsers.length} users (${stats.workspacesCreated} workspaces ${mode === "dry-run" ? "planned" : "created"}, ${stats.userErrors} errors)`
        );
      }
    }
  }

  try {
    await backfillTranscriptions(db, mode, stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[transcriptions] ERROR: ${msg}`);
    stats.userErrors++;
  }

  printSummary(mode, stats);
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
