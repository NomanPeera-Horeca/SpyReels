import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { savedScripts, scrapeJobs, subscriptions, workspaceMembers, workspaces } from "../drizzle/schema";
import { getDb } from "./db";

async function resolveUserPlan(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return sub?.plan ?? "free";
}

/**
 * Ensures the user has a personal workspace (idempotent). Returns workspace id.
 * Used on signup, backfill, and lazy recovery when a row is missing.
 */
export async function createPersonalWorkspaceForUser(
  userId: number,
  plan?: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.ownerUserId, userId), eq(workspaces.isPersonal, true)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const workspaceId = randomUUID();
  const workspacePlan = plan ?? (await resolveUserPlan(userId));

  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Personal",
    ownerUserId: userId,
    plan: workspacePlan,
    isPersonal: true,
    includedSeats: 1,
  });

  await db.insert(workspaceMembers).values({
    id: randomUUID(),
    workspaceId,
    userId,
    role: "owner",
  });

  return workspaceId;
}

/** Personal workspace for a user; creates one lazily if missing (signup recovery). */
export async function getPersonalWorkspaceId(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.ownerUserId, userId), eq(workspaces.isPersonal, true)))
    .limit(1);

  if (!row) {
    return createPersonalWorkspaceForUser(userId);
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
