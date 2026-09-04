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
import {
  extractCoachCreatorConstraints,
  formatCoachCreatorConstraintsForPrompt,
  spokenScriptFromGenerated,
  validateCoachScriptConstraints,
} from "@shared/coachCreatorConstraints";
import { creatorIdeaForKeywordRouting, resolveCoachSourceIdea } from "@shared/coachIdeaGroundTruth";
import { coachScriptModeForPlanCard, inferCoachScriptMode, type CoachScriptMode } from "@shared/coachScriptMode";
import { enforceCoachScriptConstraints } from "./coachConstraintCorrection";
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
import { buildCoachSectionsFromRemakeScript } from "@shared/remakeStudioImport";

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
  productionNotesStatus: "pending" | "processing" | "completed" | "failed" | null;
};

export function mapCoachScriptRow(row: typeof coachScripts.$inferSelect): GeneratedCoachScript {
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
    productionNotesStatus: row.productionNotesStatus ?? null,
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
  researchGroundingBlock?: string;
  rawCreatorIdea?: string;
  selectedStrategyBlock?: string;
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

  const rawCreatorIdea = resolveCoachSourceIdea({
    rawCreatorIdea: args.rawCreatorIdea,
    description: args.description,
  });
  const creatorConstraints = extractCoachCreatorConstraints(rawCreatorIdea);
  const creatorConstraintsBlock = formatCoachCreatorConstraintsForPrompt(creatorConstraints);

  let effectiveDescription = args.description;
  let explicitUserAngle =
    Boolean(rawCreatorIdea) ||
    args.description.includes("Creator goal (ground truth") ||
    args.description.includes("Creator's chosen angle");
  let scriptMode: CoachScriptMode =
    args.scriptModeOverride ??
    inferCoachScriptMode({ description: creatorIdeaForKeywordRouting(rawCreatorIdea || args.description) });
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
        description: creatorIdeaForKeywordRouting(rawCreatorIdea || args.description),
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

  const writerStarted = Date.now();
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
          {
            explicitUserAngle,
            scriptMode,
            funnelStage,
            researchGroundingBlock: args.researchGroundingBlock,
            rawCreatorIdea,
            selectedStrategyBlock: args.selectedStrategyBlock,
            creatorConstraintsBlock,
          }
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

  console.info("[CoachLatency] writer_ms", Date.now() - writerStarted, {
    promptTokens: response.usage?.prompt_tokens ?? null,
    completionTokens: response.usage?.completion_tokens ?? null,
  });

  const constrained = await enforceCoachScriptConstraints({
    generated,
    rawCreatorIdea,
    constraints: creatorConstraints,
    throwOnFailure: true,
  });
  generated = constrained.generated;

  args.onPhase?.("quality_check");
  const judgeStarted = Date.now();
  const judged = await judgeAndImproveCoachScript({
    generated,
    ctx: {
      description: rawCreatorIdea,
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      brandDescription: profile.brandDescription,
      clarifications: args.clarifications,
    },
    onRewrite: () => args.onPhase?.("quality_check"),
  });
  generated = judged.generated;
  const afterJudge = validateCoachScriptConstraints(
    spokenScriptFromGenerated(generated),
    creatorConstraints
  );
  if (!afterJudge.ok) {
    generated = constrained.generated;
  }
  console.info("[CoachLatency] judge_ms", Date.now() - judgeStarted, {
    rewriteCount: judged.regenCount,
    verdictPass: judged.judge.verdictPass,
  });
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
    sourceDescription: rawCreatorIdea.trim().slice(0, 2000),
    coachJudge: {
      overallScore: judged.judge.overallScore,
      hookEffectiveness: judged.judge.hookEffectiveness,
      viewerSense: judged.judge.viewerSense,
      nicheFit: judged.judge.nicheFit,
      skipRatePrediction: judged.judge.skipRatePrediction,
      ctaQuality: judged.judge.ctaQuality,
      verdictPass: judged.judge.verdictPass,
      regenCount: judged.regenCount,
    },
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

export function normalizeProductionCoach(coach: unknown): Record<string, unknown> {
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
      message: "Paste at least a few sentences so we can open your script in Studio.",
    });
  }

  if (!args.skipUsageCheck) {
    const usageCheck = await checkUsageLimit(args.userId, "recreateCount", args.openId);
    if (!usageCheck.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You've reached your monthly AI script limit (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
      });
    }
  }

  const profile = await getCreatorCoachProfile(args.userId);
  args.onPhase?.("write_script");

  const mapped = buildCoachSectionsFromRemakeScript(trimmed);
  const hook = mapped.hook || trimmed.slice(0, 500);
  const sections = mapped.sections;
  const bodyCombined = mapped.body || trimmed;
  const ctaText = mapped.callToAction || sections.teach || hook;

  args.onPhase?.("production_notes");

  const notesResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You add film-ready production notes for SpyReels Studio. Never rewrite spoken script lines. Return JSON only."
        ),
      },
      {
        role: "user",
        content: buildConvertRoughScriptPrompt(
          trimmed,
          profile.niche,
          profile.targetAudience,
          profile.brandDescription,
          args.workingTitle,
          {
            hook,
            explain: sections.explain,
            illustrate: sections.illustrate,
            teach: sections.teach,
            cta: sections.cta,
          }
        ),
      },
    ],
    maxTokens: 2048,
    response_format: { type: "json_object" },
  });

  const notesRaw = String(notesResponse.choices[0]?.message?.content ?? "{}");
  const notesPayload = normalizeCoachScriptPayload(
    parseLlmJson<Record<string, unknown>>(notesRaw, {})
  );
  const productionCoach = normalizeProductionCoach(notesPayload.productionCoach);
  const title =
    args.workingTitle?.trim() ||
    String(notesPayload.title ?? "").trim() ||
    hook.slice(0, 80) ||
    "Pasted script";
  const platformRaw = String(notesPayload.platform ?? "both");
  const platform = ["instagram", "tiktok", "both"].includes(platformRaw) ? platformRaw : "both";
  const hookTypeRaw = String(notesPayload.hookType ?? "").trim();
  const contentFormat = String(notesPayload.contentFormat ?? "talking-head").slice(0, 64);
  const estimatedDuration = durationLabelFromWordCount(mapped.wordCount, "story");

  const coachPayload = buildProductionNotesJson(productionCoach, sections, {
    contentFormat,
    scriptMode: "paste_import",
    hookType: hookTypeRaw || undefined,
    sourceDescription: trimmed.slice(0, 2000),
  });

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const insertResult = await db.insert(coachScripts).values({
    userId: args.userId,
    workspaceId: args.workspaceId,
    planCardId: null,
    title: title.slice(0, 256),
    hook,
    body: bodyCombined,
    callToAction: ctaText,
    platform,
    tone: String(notesPayload.tone ?? "conversational").slice(0, 64),
    estimatedDuration,
    contentType: notesPayload.contentType ? String(notesPayload.contentType).slice(0, 64) : "paste_import",
    contentFormat,
    formatLabel: notesPayload.formatLabel
      ? String(notesPayload.formatLabel).slice(0, 128)
      : "Pasted script",
    productionNotes: (() => {
      const parsed = JSON.parse(coachPayload) as Record<string, unknown>;
      parsed.importSource = "paste";
      parsed.sourcePasteScript = trimmed;
      return JSON.stringify(parsed);
    })(),
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
