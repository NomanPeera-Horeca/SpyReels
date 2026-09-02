/**
 * One real Carousel Studio generateFromInput run for the Breakdown/Listicle
 * vertical slice. Uses a real admin user from DB. No mocked Visual Director,
 * no fixture Composition IR, no fixture copy.
 *
 * Run: pnpm exec tsx scripts/run-breakdown-real-runtime.mts
 */
import "dotenv/config";

process.env.NODE_ENV = process.env.NODE_ENV || "development";
if (!process.env.STRIPE_SECRET_KEY?.trim()) {
  process.env.STRIPE_SECRET_KEY = "sk_test_local_development_placeholder_not_for_billing";
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { carouselRemakes, users } from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";
import { getDb } from "../server/db";
import { getPersonalWorkspaceId } from "../server/personalWorkspace";

const TOPIC = "The 6 Silent Cash Drains Killing Small Businesses";
const OUT_DIR = "docs/qa/carousel-breakdown-real-runtime";
const POLL_MS = 5000;
const MAX_WAIT_MS = 18 * 60 * 1000;

const here = dirname(fileURLToPath(import.meta.url));

function keyPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function captureVisualDirectorSource(): { current: string | null } {
  const captured = { current: null as string | null };
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const inspect = (...args: unknown[]) => {
    const text = args.map((arg) => String(arg)).join(" ");
    const match = text.match(/Visual Director source=([a-z_]+)/);
    if (match) captured.current = match[1] ?? null;
    if (text.includes("Visual Director fell back to baseline composition")) {
      captured.current = "baseline_fallback";
    }
  };
  console.log = (...args: unknown[]) => {
    inspect(...args);
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    inspect(...args);
    origWarn(...args);
  };
  return captured;
}

async function main() {
  const captured = captureVisualDirectorSource();
  console.log("[real-runtime] env keys present", {
    DATABASE_URL: keyPresent("DATABASE_URL"),
    ADMIN_EMAIL: keyPresent("ADMIN_EMAIL"),
    ANTHROPIC_API_KEY: keyPresent("ANTHROPIC_API_KEY"),
    OPENAI_API_KEY: keyPresent("OPENAI_API_KEY"),
  });

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const allUsers = await db.select().from(users);
  const admin =
    (configuredEmail
      ? allUsers.find(
          (row) => row.email?.trim().toLowerCase() === configuredEmail
        )
      : undefined) ??
    allUsers.find((row) => row.role === "admin") ??
    allUsers.find(
      (row) => row.email?.trim().toLowerCase() === "nomanpeera@gmail.com"
    );
  if (!admin?.email) throw new Error("Admin user not found in DB");
  process.env.ADMIN_EMAIL = admin.email;
  console.log("[real-runtime] admin user id", admin.id, "role", admin.role);

  const workspaceId = await getPersonalWorkspaceId(admin.id);
  const { appRouter } = await import("../server/routers");
  const ctx: TrpcContext = {
    user: admin,
    workspaceId,
    workspaceRole: "owner",
    req: { protocol: "http", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  const caller = appRouter.createCaller(ctx);

  const startedAt = Date.now();
  console.log("[real-runtime] calling carouselStudio.generateFromInput");
  const started = await caller.carouselStudio.generateFromInput({
    content: TOPIC,
  });
  console.log("[real-runtime] remake started", {
    remakeId: started.remakeId,
    status: started.status,
    selectedAngleIndex: started.selectedAngleIndex,
    recommendedBriefIndex: started.recommendedBriefIndex,
    estimatedSlideCount: started.estimatedSlideCount,
    angleTitles: started.angles.map((angle) => angle.title),
  });

  let row = await loadRemake(started.remakeId);
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    row = await loadRemake(started.remakeId);
    if (!row) throw new Error(`Remake ${started.remakeId} disappeared`);
    console.log("[real-runtime] poll", {
      status: row.status,
      progressStage: row.progressStage,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      vdSource: captured.current,
    });
    if (row.status === "completed" || row.status === "failed") break;
    await sleep(POLL_MS);
  }

  if (!row) throw new Error("Remake row missing after poll");
  if (row.status !== "completed" && row.status !== "failed") {
    throw new Error(
      `Remake ${started.remakeId} still ${row.status} after ${Math.round((Date.now() - startedAt) / 1000)}s`
    );
  }

  const dump = {
    remakeId: row.id,
    status: row.status,
    errorMessage: row.errorMessage,
    niche: row.niche,
    selectedAngleIndex: row.selectedAngleIndex,
    angleOptionsJson: row.angleOptionsJson,
    slotValuesJson: row.slotValuesJson,
    slideStructureJson: row.slideStructureJson,
    imageUrlsJson: row.imageUrlsJson,
    generationMetricsJson: row.generationMetricsJson,
    aspectRatioOverride: row.aspectRatioOverride,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    visualDirectorSourceFromLog: captured.current,
    generateFromInputAngles: started.angles,
    recommendedBriefIndex: started.recommendedBriefIndex,
    selectedAngleIndexFromStart: started.selectedAngleIndex,
    wallClockMs: Date.now() - startedAt,
  };

  mkdirSync(join(here, "..", OUT_DIR), { recursive: true });
  const dumpPath = join(here, "..", OUT_DIR, "remake-dump.json");
  writeFileSync(dumpPath, `${JSON.stringify(dump, null, 2)}\n`);
  console.log("[real-runtime] wrote", dumpPath);
  console.log("[real-runtime] final", {
    remakeId: row.id,
    status: row.status,
    errorMessage: row.errorMessage,
    vdSource: captured.current,
    wallClockSec: Math.round((Date.now() - startedAt) / 1000),
  });

  if (row.status === "failed") {
    process.exitCode = 1;
  }
}

async function loadRemake(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select()
    .from(carouselRemakes)
    .where(eq(carouselRemakes.id, id))
    .limit(1);
  return row ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[real-runtime] failed", err);
  process.exit(1);
});
