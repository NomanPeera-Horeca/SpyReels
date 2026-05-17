import { and, eq } from "drizzle-orm";
import { savedScripts, scrapeJobs, workspaces } from "../drizzle/schema";
import { getDb } from "./db";

/** Personal workspace for a user (Phase 1 backfill creates one per user). */
export async function getPersonalWorkspaceId(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.ownerUserId, userId), eq(workspaces.isPersonal, true)))
    .limit(1);

  if (!row) {
    throw new Error(`No personal workspace for user ${userId}`);
  }
  return row.id;
}

export async function getScrapeJobWorkspaceId(jobId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ workspaceId: scrapeJobs.workspaceId })
    .from(scrapeJobs)
    .where(eq(scrapeJobs.id, jobId))
    .limit(1);

  if (!row?.workspaceId) {
    throw new Error(`Scrape job ${jobId} has no workspaceId`);
  }
  return row.workspaceId;
}

export async function getSavedScriptWorkspaceId(scriptId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ workspaceId: savedScripts.workspaceId })
    .from(savedScripts)
    .where(eq(savedScripts.id, scriptId))
    .limit(1);

  if (!row?.workspaceId) {
    throw new Error(`Saved script ${scriptId} has no workspaceId`);
  }
  return row.workspaceId;
}
