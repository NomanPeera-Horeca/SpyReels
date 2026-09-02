/**
 * Temporary Remake 74 Visual Director-only replay.
 * Compiles Planning IR from the stored remake-74 brief + original source
 * topic. Does not regenerate angles, copy, or images.
 *
 * Run: pnpm exec tsx scripts/diagnose-remake-74-visual-director.mts
 */
import "dotenv/config";

process.env.NODE_ENV = process.env.NODE_ENV || "development";
if (!process.env.STRIPE_SECRET_KEY?.trim()) {
  process.env.STRIPE_SECRET_KEY =
    "sk_test_local_development_placeholder_not_for_billing";
}

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { carouselRemakes } from "../drizzle/schema";
import { generateCarouselVisualDirection } from "../server/carousel/generateCarouselVisualDirection";
import { getDb } from "../server/db";
import { canUseBreakdownListicleFamily } from "../shared/carouselBreakdownFamily";
import {
  compileCreativeBriefToPlanningIR,
  validateCarouselPlanningIR,
} from "../shared/carouselPlanningIR";
import {
  normalizeStoredCarouselBrief,
  type CarouselCreativeBrief,
} from "../shared/carouselStudio";

const REMAKE_ID = 74;
const SOURCE_TOPIC = "The 6 Silent Cash Drains Killing Small Businesses";
const DUMP_REL = "docs/qa/carousel-breakdown-real-runtime/remake-dump.json";

const here = dirname(fileURLToPath(import.meta.url));

function asModernBrief(value: unknown): CarouselCreativeBrief {
  const brief = normalizeStoredCarouselBrief(value, 0);
  if (!brief || brief.isLegacy) {
    throw new Error("Remake 74 stored brief is missing or legacy");
  }
  return brief;
}

async function loadStoredBrief(): Promise<unknown> {
  const db = await getDb();
  if (db) {
    const [row] = await db
      .select()
      .from(carouselRemakes)
      .where(eq(carouselRemakes.id, REMAKE_ID))
      .limit(1);
    if (row?.angleOptionsJson) {
      const stored = Array.isArray(row.angleOptionsJson)
        ? row.angleOptionsJson[row.selectedAngleIndex ?? 0]
        : null;
      if (stored) {
        console.log("[vd-diag] loaded brief from local DB remake", REMAKE_ID);
        return stored;
      }
    }
  }
  const dumpPath = join(here, "..", DUMP_REL);
  const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as {
    remakeId?: number;
    angleOptionsJson?: unknown[];
    generateFromInputAngles?: unknown[];
  };
  if (dump.remakeId !== REMAKE_ID) {
    throw new Error(`Dump remakeId is ${dump.remakeId}, expected ${REMAKE_ID}`);
  }
  const stored = dump.angleOptionsJson?.[0] ?? dump.generateFromInputAngles?.[0];
  if (!stored) throw new Error("Remake 74 dump has no stored brief");
  console.log("[vd-diag] loaded brief from dump", DUMP_REL);
  return stored;
}

async function main() {
  const stored = await loadStoredBrief();
  const brief = asModernBrief(stored);
  const planningIR = compileCreativeBriefToPlanningIR({
    brief,
    sourceContent: SOURCE_TOPIC,
  });
  const planningIssues = validateCarouselPlanningIR(planningIR);
  console.log(
    "[vd-diag] planningBeats",
    JSON.stringify(
      {
        beatCount: planningIR.beats.length,
        preferredFamily: planningIR.strategy.preferredFamily,
        contractKind: planningIR.contract.kind,
        contractCount: planningIR.contract.count,
        canUseBreakdown: canUseBreakdownListicleFamily(planningIR),
        planningIssues,
        beats: planningIR.beats.map((beat) => ({
          beatId: beat.id,
          role: beat.role,
          objective: beat.objective,
          visualIntent: beat.visualIntent,
          sequence: beat.sequence,
        })),
      },
      null,
      2
    )
  );
  if (planningIssues.length > 0) {
    throw new Error("Remake 74 Planning IR failed validation");
  }

  const result = await generateCarouselVisualDirection(planningIR);
  console.log(
    "[vd-diag] visualDirectorResult",
    JSON.stringify(
      {
        source: result.source,
        attempts: result.attempts,
        issueCount: result.issues.length,
        issues: result.issues,
        compositionSlideCount: result.compositionIR.slides.length,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[vd-diag] failed", err instanceof Error ? err.message : err);
  process.exit(1);
});
