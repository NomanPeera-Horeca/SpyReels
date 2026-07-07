import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { parseCoachScriptSections } from "@shared/coachScriptSections";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import { formatReelTaxonomyLabel } from "@shared/reelNiches";
import { coachScripts } from "../drizzle/schema";
import { getOrFetchAudienceSignals } from "./audienceResearch/service";
import {
  getDb,
  getOnboardingState,
  getScrapeJob,
  markOnboardingComplete,
  seedDemoScrape,
  updateUserPersonalization,
} from "./db";
import {
  clearOnboardingGenerationProgress,
  completeOnboardingGenerationProgress,
  failOnboardingGenerationProgress,
  initOnboardingGenerationProgress,
  setOnboardingGenerationStep,
} from "./onboardingGenerationProgress";
import { coachScriptModeForOnboarding } from "@shared/coachScriptMode";
import { generateCoachScriptForWorkspace, type GeneratedCoachScript } from "./studioGenerateScript";
import {
  buildFirstOnboardingScriptPrompt,
  routeOnboardingNicheSlugs,
} from "./onboardingRouteNiche";
import type { CreatorCoachProfile } from "./planCoachProfile";

function mapCoachRow(row: typeof coachScripts.$inferSelect): GeneratedCoachScript {
  const sections = parseCoachScriptSections({
    body: row.body,
    callToAction: row.callToAction,
    productionNotes: row.productionNotes,
  });
  return {
    id: row.id,
    title: row.title,
    hook: row.hook,
    body: row.body,
    callToAction: row.callToAction,
    explain: sections.explain,
    illustrate: sections.illustrate,
    teach: sections.teach,
    cta: sections.cta,
    platform: row.platform,
    tone: row.tone,
    estimatedDuration: row.estimatedDuration,
    contentType: row.contentType,
    contentFormat: row.contentFormat,
    formatLabel: row.formatLabel,
    productionNotes: row.productionNotes,
  };
}

function buildCoachProfileFromOnboarding(args: {
  selectedSlugs: string[];
  businessText: string;
  audienceText: string;
}): CreatorCoachProfile {
  const firstSlug = args.selectedSlugs[0]?.trim() || "business";
  return {
    nicheSlug: firstSlug,
    niche: formatReelTaxonomyLabel(firstSlug),
    targetAudience: args.audienceText,
    brandDescription: args.businessText,
  };
}

export async function runOnboardingStartCreating(args: {
  userId: number;
  workspaceId: string;
  openId: string;
  businessDescription: string;
  targetAudience: string;
}) {
  const state = await getOnboardingState(args.userId);
  if (!state) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  if (state.onboardingCompletedAt || state.onboardingSkippedAt) {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }
    const [latest] = await db
      .select()
      .from(coachScripts)
      .where(eq(coachScripts.workspaceId, args.workspaceId))
      .orderBy(desc(coachScripts.createdAt))
      .limit(1);

    return {
      alreadyComplete: true as const,
      selectedNicheSlugs: state.selectedNicheSlugs ?? [],
      script: latest ? mapCoachRow(latest) : null,
      demoJobId: null,
      demoCreatorHandle: null as string | null,
    };
  }

  const businessText = args.businessDescription.trim();
  const audienceText = args.targetAudience.trim();

  initOnboardingGenerationProgress({
    userId: args.userId,
    niche: businessText,
    audience: audienceText,
  });

  try {
    setOnboardingGenerationStep(args.userId, "save_profile");

    await updateUserPersonalization(args.userId, {
      businessDescription: businessText,
      targetAudience: audienceText,
    });
    setOnboardingGenerationStep(args.userId, "find_viral", "save_profile");

    const selectedSlugs = await routeOnboardingNicheSlugs(businessText);
    setOnboardingGenerationStep(args.userId, "audience_research", "find_viral");

    const profile = buildCoachProfileFromOnboarding({
      selectedSlugs,
      businessText,
      audienceText,
    });

    const { signals } = await getOrFetchAudienceSignals({
      workspaceId: args.workspaceId,
      nicheSlug: profile.nicheSlug,
      nicheLabel: profile.niche,
      targetAudience: profile.targetAudience,
    });
    const audienceResearchBlock = formatAudienceSignalsForPrompt(signals.slice(0, 5));
    setOnboardingGenerationStep(args.userId, "hook_angle", "audience_research");

    const description = buildFirstOnboardingScriptPrompt(businessText, audienceText);
    const script = await generateCoachScriptForWorkspace({
      userId: args.userId,
      workspaceId: args.workspaceId,
      openId: args.openId,
      description,
      skipUsageCheck: true,
      scriptModeOverride: coachScriptModeForOnboarding(),
      profileOverride: profile,
      audienceResearchBlock,
      onPhase: (phase) => {
        if (phase === "write_script") {
          setOnboardingGenerationStep(args.userId, "write_script", "hook_angle");
        } else if (phase === "production_notes") {
          setOnboardingGenerationStep(args.userId, "production_notes", "write_script");
        }
      },
    });

    const demoJobId = await seedDemoScrape(args.userId);
    await markOnboardingComplete(
      args.userId,
      selectedSlugs,
      [],
      demoJobId !== null ? new Date() : null
    );

    let demoCreatorHandle: string | null = null;
    if (demoJobId) {
      const seededJob = await getScrapeJob(demoJobId);
      demoCreatorHandle = seededJob?.handle ?? null;
    }

    completeOnboardingGenerationProgress(args.userId);

    return {
      alreadyComplete: false as const,
      selectedNicheSlugs: selectedSlugs,
      script,
      demoJobId,
      demoCreatorHandle,
    };
  } catch (err) {
    const message =
      err instanceof TRPCError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
    failOnboardingGenerationProgress(args.userId, message);
    throw err instanceof TRPCError
      ? err
      : new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  } finally {
    setTimeout(() => {
      clearOnboardingGenerationProgress(args.userId);
    }, 60_000);
  }
}
