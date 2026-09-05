/**
 * Local QA only. Not product code.
 * Builds a Roadmap remake for Prompt A (grounded steps) or Prompt B (no steps).
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  CAROUSEL_STUDIO_TEMPLATE_ID,
  isLegacyCreativeBrief,
  resolveStudioCarouselNiche,
  type CarouselCreativeBrief,
} from "../shared/carouselStudio";
import { compileCreativeBriefToPlanningIR } from "../shared/carouselPlanningIR";
import { canUseBreakdownListicleFamily } from "../shared/carouselBreakdownFamily";
import { canUseComparisonFamily } from "../shared/carouselComparisonFamily";
import { canUseFrameworkFamily } from "../shared/carouselFrameworkFamily";
import { canUseRoadmapFamily } from "../shared/carouselRoadmapFamily";
import { canUseStoryNarrativeFamily } from "../shared/carouselStoryFamily";
import { carouselRemakes, users } from "../drizzle/schema";
import { getDb, getUserByEmail } from "../server/db";
import { getPersonalWorkspaceId } from "../server/personalWorkspace";
import { proposeStudioAngles } from "../server/carousel/proposeStudioAngles";
import {
  buildStudioRemakeHandoff,
  planGenerateFromInput,
} from "../server/carousel/studioOrchestration";
import { generateCarouselRemake } from "../server/carousel/generateCarouselRemake";

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function briefFamily(brief: CarouselCreativeBrief): string {
  return `${brief.contentFormat}/${brief.angleType}/${brief.layoutFamily}`;
}

function constructedMenuBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: "brief_qa_roadmap_menu",
    kicker: "How to",
    title: "How to simplify a restaurant menu without hurting revenue",
    description: "A path to cut the menu and keep the sales.",
    estimatedSlideCount: 7,
    topic: "restaurant menus",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The prompt is written for restaurant operators.",
    contentGoal: "education",
    contentFormat: "roadmap",
    angleType: "how_to",
    hook: "Cut the menu without cutting the sales.",
    corePromise: "Give owners a path to simplify the menu and keep revenue.",
    centralInsight: "The sell-through path matters more than the item count.",
    keyPoints: [
      { title: "Cut the dead weight", purpose: "Step 1", explanation: "Remove items that never get reordered." },
      { title: "Protect signatures", purpose: "Step 2", explanation: "Keep the plates guests already ask for." },
      { title: "Rebuild the ticket", purpose: "Step 3", explanation: "Make the remaining path easy to order." },
      { title: "Watch reorders", purpose: "Step 4", explanation: "Use reorder rate as the check." },
    ],
    slideOutline: [
      { position: 1, role: "hook", objective: "Name the menu-simplification path", recommendedVisual: "text", listItemIndex: null },
      { position: 2, role: "context", objective: "Show the four-step route before the first cut", recommendedVisual: "diagram", listItemIndex: null },
      { position: 3, role: "insight", objective: "Cut the items that never get reordered", recommendedVisual: "checklist", listItemIndex: 1 },
      { position: 4, role: "insight", objective: "Protect the signature plates", recommendedVisual: "text", listItemIndex: 2 },
      { position: 5, role: "insight", objective: "Rebuild the ticket path around what remains", recommendedVisual: "text", listItemIndex: 3 },
      { position: 6, role: "insight", objective: "Watch reorder rate for two weeks", recommendedVisual: "text", listItemIndex: 4 },
      { position: 7, role: "cta", objective: "Close on the first cut", recommendedVisual: "text", listItemIndex: null },
    ],
    layoutFamily: "roadmap",
    visualDirection: "A guided execution path. Current step must stay obvious.",
    imageDirection: "Photos only if a slide asks.",
    claimRisk: "low",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: ["Guaranteed sales"],
    ctaDirection: "Start with the items that never get reordered",
    scores: {
      relevance: 86,
      usefulness: 88,
      specificity: 84,
      visualPotential: 80,
      factualSafety: 88,
      originality: 78,
      overall: 84,
    },
    confidence: 0.84,
  };
}

function constructedNonStepBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: "brief_qa_roadmap_nonstep",
    kicker: "How to",
    title: "How to prepare a kitchen without turning it into a checklist",
    description: "Instructional action without a grounded numbered journey.",
    estimatedSlideCount: 7,
    topic: "restaurant kitchens",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The prompt is written for restaurant operators.",
    contentGoal: "education",
    contentFormat: "roadmap",
    angleType: "how_to",
    hook: "Prep the kitchen. Do not add another admin layer.",
    corePromise: "Show the next action, not a fake four-step model.",
    centralInsight: "Inspection readiness is a habit, not a numbered poster.",
    keyPoints: [
      { title: "Set the standard", purpose: "Setup", explanation: "Name what clean means on a Saturday." },
      { title: "Do the walk", purpose: "Action", explanation: "Walk the line the way an inspector would." },
      { title: "Fix the first miss", purpose: "Example", explanation: "Correct one station before you print a list." },
      { title: "Hold the habit", purpose: "Takeaway", explanation: "Keep the walk, skip the extra admin." },
    ],
    slideOutline: [
      { position: 1, role: "hook", objective: "Open on kitchen readiness", recommendedVisual: "text", listItemIndex: null },
      { position: 2, role: "context", objective: "Set the inspection-ready standard", recommendedVisual: "text", listItemIndex: null },
      { position: 3, role: "problem", objective: "Name the admin trap", recommendedVisual: "text", listItemIndex: null },
      { position: 4, role: "insight", objective: "Walk the line the way an inspector would", recommendedVisual: "text", listItemIndex: null },
      { position: 5, role: "example", objective: "Fix one station before you add a form", recommendedVisual: "text", listItemIndex: null },
      { position: 6, role: "insight", objective: "Hold the habit without extra admin", recommendedVisual: "text", listItemIndex: null },
      { position: 7, role: "cta", objective: "Close on the next walk", recommendedVisual: "text", listItemIndex: null },
    ],
    layoutFamily: "roadmap",
    visualDirection: "Editorial action geometry. No numbered journey.",
    imageDirection: "Photos only if a slide asks.",
    claimRisk: "low",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: ["Guaranteed pass"],
    ctaDirection: "Walk the line tonight",
    scores: {
      relevance: 82,
      usefulness: 84,
      specificity: 80,
      visualPotential: 76,
      factualSafety: 88,
      originality: 74,
      overall: 81,
    },
    confidence: 0.8,
  };
}

function constructedBriefForIdea(idea: string): CarouselCreativeBrief {
  if (/inspection|admin|non-step|nonstep/i.test(idea)) return constructedNonStepBrief();
  return constructedMenuBrief();
}

async function main() {
  const idea = argValue("--idea")?.trim();
  const outDir = resolve(
    argValue("--out") ?? "docs/qa/carousel-howto-roadmap-family-v1/tmp"
  );
  if (!idea) throw new Error("Missing --idea");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const user = adminEmail
    ? await getUserByEmail(adminEmail)
    : (
        await db.select().from(users).where(eq(users.role, "admin")).limit(1)
      )[0] ?? (await db.select().from(users).limit(1))[0];
  if (!user) throw new Error("No user available for local remake insert");

  const workspaceId = await getPersonalWorkspaceId(user.id);
  const niche = resolveStudioCarouselNiche(undefined, idea);

  const skipAuto = process.argv.includes("--skip-auto");
  let autoFamily = "skipped";
  let autoPlanAngles: Array<
    | { title: string; legacy: true }
    | {
        title: string;
        contentFormat: string;
        angleType: string;
        layoutFamily: string;
        estimatedSlideCount: number;
      }
  > = [];
  let selectedAngleIndex = 0;

  if (!skipAuto) {
    const angles = await proposeStudioAngles({
      sourceContent: idea,
      entryPoint: "carouselStudio.generateFromInput",
      requiredValidBriefs: 1,
    });
    const autoPlan = planGenerateFromInput(
      angles.briefs,
      angles.formatRecommendation,
      idea
    );
    const autoSelected = autoPlan.selected;
    autoFamily = !autoSelected
      ? "none"
      : isLegacyCreativeBrief(autoSelected)
        ? "legacy"
        : briefFamily(autoSelected);
    selectedAngleIndex = autoPlan.selectedAngleIndex ?? 0;
    autoPlanAngles = autoPlan.angles.map((brief) =>
      isLegacyCreativeBrief(brief)
        ? { title: brief.title, legacy: true }
        : {
            title: brief.title,
            contentFormat: brief.contentFormat,
            angleType: brief.angleType,
            layoutFamily: brief.layoutFamily,
            estimatedSlideCount: brief.estimatedSlideCount,
          }
    );
  }

  const selected = constructedBriefForIdea(idea);
  const selectionMode = "constructedRoadmapQa" as const;

  const remakeHandoff = isLegacyCreativeBrief(selected)
    ? { creativeBrief: constructedBriefForIdea(idea) }
    : buildStudioRemakeHandoff(selected);
  const creativeBrief =
    remakeHandoff.creativeBrief ?? constructedBriefForIdea(idea);

  const planningIR = compileCreativeBriefToPlanningIR({
    brief: creativeBrief,
    sourceContent: idea,
  });

  console.log(`[qa] idea: ${idea}`);
  console.log(`[qa] autoSelected: ${autoFamily}`);
  console.log(`[qa] selectionMode: ${selectionMode}`);
  console.log(`[qa] selected: ${creativeBrief.title}`);
  console.log(`[qa] strategy: ${briefFamily(creativeBrief)}`);
  console.log(`[qa] roadmap eligible: ${canUseRoadmapFamily(planningIR)}`);
  console.log(`[qa] framework eligible: ${canUseFrameworkFamily(planningIR)}`);
  console.log(`[qa] comparison eligible: ${canUseComparisonFamily(planningIR)}`);
  console.log(`[qa] story eligible: ${canUseStoryNarrativeFamily(planningIR)}`);
  console.log(
    `[qa] breakdown eligible: ${canUseBreakdownListicleFamily(planningIR)}`
  );

  const insertResult = await db.insert(carouselRemakes).values({
    userId: user.id,
    workspaceId,
    templateId: CAROUSEL_STUDIO_TEMPLATE_ID,
    niche: niche.slice(0, 500),
    sourceUrl: null,
    status: "processing",
    angleOptionsJson: autoPlanAngles,
    selectedAngleIndex,
    aspectRatioOverride: "4:5",
  });
  const remakeId = insertResult[0].insertId;
  if (!remakeId) throw new Error("Failed to start carousel generation");

  await generateCarouselRemake(remakeId, CAROUSEL_STUDIO_TEMPLATE_ID, niche, {
    sourceContent: idea,
    creativeBrief,
    telemetry: undefined,
  });

  const [row] = await db
    .select()
    .from(carouselRemakes)
    .where(eq(carouselRemakes.id, remakeId))
    .limit(1);
  if (!row) throw new Error(`Remake ${remakeId} missing after generation`);

  mkdirSync(outDir, { recursive: true });
  const dump = {
    remakeId,
    idea,
    autoSelectedFamily: autoFamily,
    selectionMode,
    selectedBrief: {
      id: creativeBrief.id,
      title: creativeBrief.title,
      contentFormat: creativeBrief.contentFormat,
      angleType: creativeBrief.angleType,
      layoutFamily: creativeBrief.layoutFamily,
      estimatedSlideCount: creativeBrief.estimatedSlideCount,
    },
    angles: autoPlanAngles,
    roadmapEligible: canUseRoadmapFamily(planningIR),
    frameworkEligible: canUseFrameworkFamily(planningIR),
    comparisonEligible: canUseComparisonFamily(planningIR),
    storyEligible: canUseStoryNarrativeFamily(planningIR),
    breakdownEligible: canUseBreakdownListicleFamily(planningIR),
    planningIR: {
      preferredFamily: planningIR.strategy.preferredFamily,
      angleType: planningIR.strategy.angleType,
      contractKind: planningIR.contract.kind,
      beats: planningIR.beats.map((beat) => ({
        position: beat.position,
        role: beat.role,
        objective: beat.objective,
        visualIntent: beat.visualIntent,
        sequence: beat.sequence,
      })),
    },
    status: row.status,
    errorMessage: row.errorMessage,
    generationMetricsJson: row.generationMetricsJson,
    slideStructureJson: row.slideStructureJson,
    slotValuesJson: row.slotValuesJson,
    imageUrlsJson: row.imageUrlsJson,
    designOverrideJson: row.designOverrideJson,
  };
  writeFileSync(resolve(outDir, "remake-dump.json"), JSON.stringify(dump, null, 2));
  console.log(
    `[qa] remake ${remakeId} status=${row.status} wrote ${outDir}/remake-dump.json`
  );
  if (row.status !== "completed") process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
