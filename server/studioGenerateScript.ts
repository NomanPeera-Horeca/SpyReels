import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  buildCoachPrompt,
  buildConvertRoughScriptPrompt,
  buildStudioDateContext,
  COACH_SYSTEM_PROMPT,
} from "@shared/studioHeit";
import {
  buildProductionNotesJson,
  coachScriptIsComplete,
  combineBodyFromSections,
  sectionsFromGenerated,
  type CoachScriptSections,
} from "@shared/coachScriptSections";
import {
  buildCoachLengthAndHookRules,
  coachMaxTotalWords,
  coachScriptWithinBudget,
  coachScriptWordCount,
  durationLabelFromWordCount,
} from "@shared/coachScriptLength";
import { coachScriptModeForPlanCard, inferCoachScriptMode, type CoachScriptMode } from "@shared/coachScriptMode";
import { coachScripts, planCards } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { getCreatorCoachProfile, type CreatorCoachProfile } from "./planCoachProfile";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import { getAudienceSignalsByIds, getOrFetchAudienceSignals } from "./audienceResearch/service";
import { checkUsageLimit, incrementUsage } from "./stripe/stripe-service";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { normalizeCoachScriptPayload, parseLlmJson } from "./utils/parseLlmJson";
import { parseCoachScriptSections } from "@shared/coachScriptSections";
import { judgeAndImproveCoachScript } from "./coachScriptJudge";

export type GeneratedCoachScript = {
  id: number;
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  explain: string;
  illustrate: string;
  teach: string;
  cta: string;
  platform: string;
  tone: string;
  estimatedDuration: string | null;
  contentType: string | null;
  contentFormat: string | null;
  formatLabel: string | null;
  productionNotes: string | null;
};

function mapCoachScriptRow(row: typeof coachScripts.$inferSelect): GeneratedCoachScript {
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

export async function generateCoachScriptForWorkspace(args: {
  userId: number;
  workspaceId: string;
  openId: string;
  description: string;
  clarifications?: Array<{ question: string; answer: string }>;
  planCardId?: number;
  audienceSignalIds?: number[];
  skipUsageCheck?: boolean;
  profileOverride?: CreatorCoachProfile;
  audienceResearchBlock?: string;
  onPhase?: (phase: "hook_angle" | "write_script" | "quality_check" | "production_notes") => void;
  scriptModeOverride?: CoachScriptMode;
}): Promise<GeneratedCoachScript> {
  if (!args.skipUsageCheck) {
    const usageCheck = await checkUsageLimit(args.userId, "recreateCount", args.openId);
    if (!usageCheck.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You've reached your monthly AI script limit (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
      });
    }
  }

  const profile = args.profileOverride ?? (await getCreatorCoachProfile(args.userId));
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  let audienceResearchBlock = args.audienceResearchBlock ?? "";
  if (!audienceResearchBlock) {
    const audienceSignalIds = args.audienceSignalIds ?? [];
    if (audienceSignalIds.length > 0) {
      const attachedSignals = await getAudienceSignalsByIds(args.workspaceId, audienceSignalIds);
      audienceResearchBlock = formatAudienceSignalsForPrompt(attachedSignals);
    } else {
      const { signals } = await getOrFetchAudienceSignals({
        workspaceId: args.workspaceId,
        nicheSlug: profile.nicheSlug,
        nicheLabel: profile.niche,
        targetAudience: profile.targetAudience,
      });
      audienceResearchBlock = formatAudienceSignalsForPrompt(signals.slice(0, 5));
    }
  }

  args.onPhase?.("write_script");

  let effectiveDescription = args.description;
  let explicitUserAngle =
    args.description.includes("Creator goal (ground truth") ||
    args.description.includes("Creator's chosen angle");
  let scriptMode: CoachScriptMode =
    args.scriptModeOverride ?? inferCoachScriptMode({ description: args.description });
  let funnelStage: string | null = null;

  if (args.planCardId) {
    const [planCard] = await db
      .select()
      .from(planCards)
      .where(
        and(eq(planCards.id, args.planCardId), eq(planCards.workspaceId, args.workspaceId))
      )
      .limit(1);
    if (planCard) {
      const isSpark = planCard.sourceType === "user_spark" || planCard.day === 0;
      if (isSpark) {
        explicitUserAngle = true;
      }
      funnelStage = planCard.funnelStage ?? null;
      scriptMode = coachScriptModeForPlanCard({
        description: args.description,
        contentFormat: planCard.contentFormat,
        funnelStage: planCard.funnelStage,
        sourceType: planCard.sourceType,
        day: planCard.day,
      });
      const planBlock = isSpark
        ? [
            `Spark Deck idea: ${planCard.title}`,
            `Creator note (ground truth): ${planCard.userRawNote ?? planCard.angle}`,
            `Hook direction: ${planCard.hook}`,
            planCard.researchSignal
              ? `Inspired by reel caption: ${planCard.researchSignal}`
              : null,
          ]
        : [
            `30-day plan Day ${planCard.day}: ${planCard.title}`,
            `Funnel stage: ${planCard.funnelStage ?? "tofu"}`,
            `Angle: ${planCard.angle}`,
            `Hook idea: ${planCard.hook}`,
            planCard.filmingLocation ? `Filming location: ${planCard.filmingLocation}` : null,
            planCard.researchSignal ? `Research signal: ${planCard.researchSignal}` : null,
          ];
      effectiveDescription = `${args.description}\n\n--- Approved plan context (ground truth) ---\n${planBlock.filter(Boolean).join("\n")}`;
    }
  }

  const response = await invokeLLM({
    messages: [
      { role: "system", content: withAiFormattingRules(`${COACH_SYSTEM_PROMPT}\n\n${buildStudioDateContext()}`) },
      {
        role: "user",
        content: buildCoachPrompt(
          effectiveDescription,
          profile.niche,
          profile.targetAudience,
          profile.brandDescription,
          args.clarifications,
          audienceResearchBlock,
          { explicitUserAngle, scriptMode, funnelStage }
        ),
      },
    ],
    maxTokens: 4096,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  let generated = normalizeCoachScriptPayload(parseLlmJson<Record<string, unknown>>(raw, {}));
  if (!coachScriptIsComplete(generated)) {
    console.warn("[studio.generate] incomplete LLM payload", raw.slice(0, 800));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "AI returned an incomplete script. Please try again.",
    });
  }

  args.onPhase?.("quality_check");
  const judged = await judgeAndImproveCoachScript({
    generated,
    ctx: {
      description: effectiveDescription,
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      brandDescription: profile.brandDescription,
      clarifications: args.clarifications,
    },
    onRewrite: () => args.onPhase?.("quality_check"),
  });
  generated = judged.generated;
  if (!coachScriptIsComplete(generated)) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "AI returned an incomplete script after quality review. Please try again.",
    });
  }

  args.onPhase?.("production_notes");

  const finalized = await finalizeCoachGenerated(generated, scriptMode);
  const { generated: finalGenerated, sections, hook, estimatedDuration } = finalized;
  const productionCoach = normalizeProductionCoach(finalGenerated.productionCoach);

  const platformRaw = String(finalGenerated.platform ?? "both");
  const platform = ["instagram", "tiktok", "both"].includes(platformRaw) ? platformRaw : "both";

  const bodyCombined = combineBodyFromSections(sections);
  // DB column is NOT NULL; when AI skips CTA, store teach as close text only.
  // UI reads optional CTA from productionNotes.sections.cta.
  const ctaText = sections.cta.trim() || sections.teach || String(finalGenerated.callToAction ?? "");

  const hookTypeRaw = String(finalGenerated.hookType ?? "").trim();
  const coachPayload = buildProductionNotesJson(productionCoach, sections, {
    contentFormat: String(finalGenerated.contentFormat ?? "talking-head"),
    funnelStage: funnelStage ?? undefined,
    scriptMode,
    hookType: hookTypeRaw || undefined,
  });

  const insertResult = await db.insert(coachScripts).values({
    userId: args.userId,
    workspaceId: args.workspaceId,
    planCardId: args.planCardId ?? null,
    title: String(finalGenerated.title ?? "Untitled script").slice(0, 256),
    hook,
    body: bodyCombined,
    callToAction: ctaText,
    platform,
    tone: String(finalGenerated.tone ?? "conversational").slice(0, 64),
    estimatedDuration,
    contentType: finalGenerated.contentType ? String(finalGenerated.contentType).slice(0, 64) : null,
    contentFormat: finalGenerated.contentFormat ? String(finalGenerated.contentFormat).slice(0, 64) : null,
    formatLabel: finalGenerated.formatLabel ? String(finalGenerated.formatLabel).slice(0, 128) : null,
    productionNotes: coachPayload,
  });

  const scriptId = insertResult[0]?.insertId;
  if (!scriptId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save script" });
  }

  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, scriptId)).limit(1);
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load script" });
  }

  if (!args.skipUsageCheck) {
    await incrementUsage(args.userId, "recreateCount");
  }
  return mapCoachScriptRow(row);
}

function pickCoachString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeProductionCoach(coach: unknown): Record<string, unknown> {
  const base =
    coach && typeof coach === "object" ? { ...(coach as Record<string, unknown>) } : {};
  const hookOnScreen =
    pickCoachString(base, "hookOnScreenText", "hook_on_screen_text") ||
    pickCoachString(base, "textOverlay", "text_overlay");
  if (hookOnScreen) {
    const capped = hookOnScreen.slice(0, 30);
    base.hookOnScreenText = capped;
    base.frame0OnScreenText =
      pickCoachString(base, "frame0OnScreenText", "frame_0_on_screen_text") || capped;
    if (!pickCoachString(base, "textOverlay", "text_overlay")) {
      base.textOverlay = capped;
    }
  }
  const visualBeat = pickCoachString(base, "hookVisualBeat", "hook_visual_beat", "visualHookBeat");
  if (visualBeat) {
    base.hookVisualBeat = visualBeat.slice(0, 280);
  }
  return base;
}

async function tightenCoachScriptPayload(
  generated: Record<string, unknown>,
  mode: CoachScriptMode
): Promise<Record<string, unknown>> {
  const hook = String(generated.hook ?? "");
  const sections = sectionsFromGenerated(generated);
  const words = coachScriptWordCount(hook, sections);
  const maxWords = coachMaxTotalWords(mode);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You shorten Reel scripts. Return only valid JSON with the same fields as the input."
        ),
      },
      {
        role: "user",
        content: `This HEIT script is too long (${words} spoken words; max ${maxWords}). Shorten every section. Keep open-loop structure. Preserve meaning.

${buildCoachLengthAndHookRules(mode)}

Return JSON with: title, hook, explain, illustrate, teach, cta, contentType, contentFormat, formatLabel, platform, tone, productionCoach (include hookOnScreenText, frame0OnScreenText, pacingNotes, loopClosingNote).

Current script:
${JSON.stringify({ title: generated.title, hook, ...sections, productionCoach: generated.productionCoach }, null, 2)}`,
      },
    ],
    maxTokens: 2048,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  return normalizeCoachScriptPayload(parseLlmJson<Record<string, unknown>>(raw, generated));
}

async function finalizeCoachGenerated(
  generated: Record<string, unknown>,
  mode: CoachScriptMode = "story"
): Promise<{
  generated: Record<string, unknown>;
  sections: CoachScriptSections;
  hook: string;
  estimatedDuration: string;
}> {
  let payload = generated;
  let hook = String(payload.hook ?? "");
  let sections = sectionsFromGenerated(payload);

  if (!coachScriptWithinBudget(hook, sections, mode)) {
    payload = await tightenCoachScriptPayload(payload, mode);
    hook = String(payload.hook ?? "");
    sections = sectionsFromGenerated(payload);
  }

  const totalWords = coachScriptWordCount(hook, sections);
  return {
    generated: payload,
    sections,
    hook,
    estimatedDuration: durationLabelFromWordCount(totalWords, mode),
  };
}

export async function convertRoughScriptForWorkspace(args: {
  userId: number;
  workspaceId: string;
  openId: string;
  roughScript: string;
  workingTitle?: string;
  skipUsageCheck?: boolean;
  onPhase?: (phase: "hook_angle" | "write_script" | "quality_check" | "production_notes") => void;
}): Promise<GeneratedCoachScript> {
  const trimmed = args.roughScript.trim();
  if (trimmed.length < 20) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Paste at least a few sentences so we can structure your script.",
    });
  }

  const profile = await getCreatorCoachProfile(args.userId);
  const description = buildConvertRoughScriptPrompt(
    trimmed,
    profile.niche,
    profile.targetAudience,
    profile.brandDescription,
    args.workingTitle
  );

  return generateCoachScriptForWorkspace({
    userId: args.userId,
    workspaceId: args.workspaceId,
    openId: args.openId,
    description,
    skipUsageCheck: args.skipUsageCheck,
    profileOverride: profile,
    onPhase: args.onPhase,
  });
}
