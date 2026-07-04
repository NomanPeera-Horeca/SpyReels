import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  buildAnalysisPrompt,
  buildCoachPrompt,
  buildHookVariationsPrompt,
  buildPlanGenerationPrompt,
  buildPlanRegeneratePrompt,
  buildStudioDateContext,
  COACH_SYSTEM_PROMPT,
} from "@shared/studioHeit";
import {
  buildProductionNotesJson,
  coachScriptIsComplete,
  combineBodyFromSections,
  countWords,
  flattenViralScriptForCopy,
  parseCoachScriptSections,
  parseProductionNotes,
  sectionsFromGenerated,
} from "@shared/coachScriptSections";
import { coachScripts, planCards } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, createSavedScript } from "../db";
import { getCreatorCoachProfile } from "../planCoachProfile";
import { resolveCoachIntent } from "../studioCoachAgent";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import {
  getAudienceSignalsByIds,
  getOrFetchAudienceSignals,
} from "../audienceResearch/service";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { generateCoachScriptWithProgress, convertRoughScriptWithProgress, getCoachGenerationProgress } from "../coachGenerateWithProgress";
import {
  completeAgentProgress,
  failAgentProgress,
  getAgentProgress,
  initAgentProgress,
  scheduleClearAgentProgress,
  setAgentProgressSteps,
} from "../agentProgressStore";
import {
  buildPlanProgressSteps,
  type PlanProgressStepId,
} from "@shared/planAgentProgress";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import {
  extractPlanCardsFromParsed,
  normalizeCoachScriptPayload,
  parseLlmJson,
} from "../utils/parseLlmJson";
import type { CoachCapabilityId } from "@shared/studioCoachUi";

const PLAN_BATCHES = [
  { startDay: 1, endDay: 10 },
  { startDay: 11, endDay: 20 },
  { startDay: 21, endDay: 30 },
] as const;

const MIN_PLAN_CARDS = 24;

const planGoalSchema = z.enum(["grow", "viral", "authority", "monetize"]);
const planPlatformSchema = z.enum(["instagram", "tiktok", "youtube", "all"]);
const cardStatusSchema = z.enum(["pending", "approved", "rejected"]);

type RawPlanCard = {
  day?: number;
  funnelStage?: string;
  contentFormat?: string;
  platform?: string;
  title?: string;
  hook?: string;
  angle?: string;
  filmingLocation?: string;
  researchSignal?: string;
};

function parseJsonFromLlm<T>(raw: string, fallback: T): T {
  return parseLlmJson(raw, fallback);
}

async function generatePlanCardBatch(args: {
  niche: string;
  targetAudience: string;
  goal: string;
  platforms: string[];
  brandDescription: string | null;
  startDay: number;
  endDay: number;
  audienceResearchBlock?: string;
}): Promise<RawPlanCard[]> {
  const response = await invokeLLM({
    messages: [
      {
        role: "user",
        content: withAiFormattingRules(
          buildPlanGenerationPrompt(
            args.niche,
            args.targetAudience,
            args.goal,
            args.platforms,
            args.brandDescription,
            {
              startDay: args.startDay,
              endDay: args.endDay,
              audienceResearchBlock: args.audienceResearchBlock,
            }
          )
        ),
      },
    ],
    maxTokens: 4096,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  const finishReason = response.choices[0]?.finish_reason;
  const parsed = parseJsonFromLlm<unknown>(raw, null);
  const cards = extractPlanCardsFromParsed<RawPlanCard>(parsed);

  if (cards.length < 5) {
    console.warn("[plan.generate] batch incomplete", {
      startDay: args.startDay,
      endDay: args.endDay,
      finishReason,
      cardCount: cards.length,
      rawPreview: raw.slice(0, 600),
    });
  }

  return cards;
}

function mapPlanCardRow(row: typeof planCards.$inferSelect) {
  return {
    id: row.id,
    day: row.day,
    funnelStage: row.funnelStage,
    contentFormat: row.contentFormat,
    platform: row.platform,
    title: row.title,
    hook: row.hook,
    angle: row.angle,
    filmingLocation: row.filmingLocation,
    researchSignal: row.researchSignal,
    status: row.status,
    goal: row.goal,
  };
}

function mapCoachScriptSummary(row: typeof coachScripts.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    hookPreview: row.hook.slice(0, 120),
    planCardId: row.planCardId,
    contentFormat: row.contentFormat,
    formatLabel: row.formatLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCoachScriptRow(row: typeof coachScripts.$inferSelect) {
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

async function assertCoachScriptInWorkspace(scriptId: number, workspaceId: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [row] = await db
    .select({ id: coachScripts.id })
    .from(coachScripts)
    .where(and(eq(coachScripts.id, scriptId), eq(coachScripts.workspaceId, workspaceId)))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
  }
}

const PLAN_FLOW = "plan" as const;

function setPlanProgressStep(
  userId: number,
  activeStepId: PlanProgressStepId,
  completedThrough?: PlanProgressStepId
) {
  const current = getAgentProgress(PLAN_FLOW, userId);
  if (!current || current.status !== "running") return;
  setAgentProgressSteps({
    flow: PLAN_FLOW,
    userId,
    steps: buildPlanProgressSteps(activeStepId, completedThrough),
  });
}

export const planRouter = router({
  getGenerationProgress: protectedProcedure.query(({ ctx }) => {
    return getAgentProgress(PLAN_FLOW, ctx.user.id);
  }),

  generate: protectedProcedure
    .input(
      z.object({
        goal: planGoalSchema,
        platforms: z.array(planPlatformSchema).min(1).max(4),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const usageCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
      if (!usageCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You've reached your monthly AI script limit (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
        });
      }

      initAgentProgress({
        flow: PLAN_FLOW,
        userId: ctx.user.id,
        steps: buildPlanProgressSteps("read_profile"),
      });

      try {
        setPlanProgressStep(ctx.user.id, "read_profile");
        const profile = await getCreatorCoachProfile(ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        setPlanProgressStep(ctx.user.id, "audience_research", "read_profile");
        const { signals: audienceSignalsList } = await getOrFetchAudienceSignals({
          workspaceId: ctx.workspaceId,
          nicheSlug: profile.nicheSlug,
          nicheLabel: profile.niche,
          targetAudience: profile.targetAudience,
          forceRefresh: true,
        });
        const audienceResearchBlock = formatAudienceSignalsForPrompt(audienceSignalsList);

        const batchStepIds: PlanProgressStepId[] = ["ideas_week1", "ideas_week2", "ideas_week3"];
        const cardsRaw: RawPlanCard[] = [];
        for (const [batchIndex, batch] of PLAN_BATCHES.entries()) {
          const stepId = batchStepIds[batchIndex]!;
          const completedThrough =
            batchIndex === 0 ? ("audience_research" as PlanProgressStepId) : batchStepIds[batchIndex - 1]!;
          setPlanProgressStep(ctx.user.id, stepId, completedThrough);

          let batchCards = await generatePlanCardBatch({
            niche: profile.niche,
            targetAudience: profile.targetAudience,
            goal: input.goal,
            platforms: input.platforms,
            brandDescription: profile.brandDescription,
            startDay: batch.startDay,
            endDay: batch.endDay,
            audienceResearchBlock,
          });

          if (batchCards.length < 5) {
            batchCards = await generatePlanCardBatch({
              niche: profile.niche,
              targetAudience: profile.targetAudience,
              goal: input.goal,
              platforms: input.platforms,
              brandDescription: profile.brandDescription,
              startDay: batch.startDay,
              endDay: batch.endDay,
              audienceResearchBlock,
            });
          }

          cardsRaw.push(...batchCards);
        }

        if (cardsRaw.length < MIN_PLAN_CARDS) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Plan generation returned incomplete results. Please try again.",
          });
        }

        setPlanProgressStep(ctx.user.id, "finalize_board", "ideas_week3");

        const cardsByDay = new Map<number, RawPlanCard>();
        for (const [idx, card] of cardsRaw.entries()) {
          const day = typeof card.day === "number" ? card.day : idx + 1;
          cardsByDay.set(day, { ...card, day });
        }
        const dedupedCards = Array.from(cardsByDay.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, card]) => card);

        await db.delete(planCards).where(eq(planCards.workspaceId, ctx.workspaceId));

        const values = dedupedCards
          .slice(0, 30)
          .map((c, idx) => ({
            userId: ctx.user.id,
            workspaceId: ctx.workspaceId,
            day: typeof c.day === "number" ? c.day : idx + 1,
            funnelStage: (c.funnelStage ?? "tofu").slice(0, 16),
            contentFormat: (c.contentFormat ?? "talking-head").slice(0, 32),
            platform: (c.platform ?? "instagram").slice(0, 32),
            title: String(c.title ?? "Untitled idea").slice(0, 2000),
            hook: String(c.hook ?? "").slice(0, 2000),
            angle: String(c.angle ?? "").slice(0, 4000),
            filmingLocation: String(c.filmingLocation ?? "At your desk").slice(0, 500),
            researchSignal: c.researchSignal ? String(c.researchSignal).slice(0, 2000) : null,
            status: "pending",
            goal: input.goal,
          }))
          .sort((a, b) => a.day - b.day);

        await db.insert(planCards).values(values);
        await incrementUsage(ctx.user.id, "recreateCount");

        const inserted = await db
          .select()
          .from(planCards)
          .where(eq(planCards.workspaceId, ctx.workspaceId))
          .orderBy(asc(planCards.day));

        setPlanProgressStep(ctx.user.id, "finalize_board", "finalize_board");
        completeAgentProgress(PLAN_FLOW, ctx.user.id);

        return {
          cards: inserted.map(mapPlanCardRow),
          audienceSignals: audienceSignalsList.map((signal) => ({
            id: signal.id ?? 0,
            source: signal.source,
            title: signal.title,
            snippet: signal.snippet,
            sourceUrl: signal.sourceUrl,
          })),
        };
      } catch (err) {
        const message =
          err instanceof TRPCError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.";
        failAgentProgress({ flow: PLAN_FLOW, userId: ctx.user.id, errorMessage: message });
        throw err;
      } finally {
        scheduleClearAgentProgress(PLAN_FLOW, ctx.user.id);
      }
    }),

  listCards: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const rows = await db
      .select()
      .from(planCards)
      .where(eq(planCards.workspaceId, ctx.workspaceId))
      .orderBy(asc(planCards.day));
    return { cards: rows.map(mapPlanCardRow) };
  }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1).max(30),
        status: cardStatusSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(planCards)
        .set({ status: input.status })
        .where(
          and(
            eq(planCards.workspaceId, ctx.workspaceId),
            inArray(planCards.id, input.ids)
          )
        );

      const updated = await db
        .select()
        .from(planCards)
        .where(
          and(
            eq(planCards.workspaceId, ctx.workspaceId),
            inArray(planCards.id, input.ids)
          )
        );

      return { cards: updated.map(mapPlanCardRow) };
    }),

  regenerate: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1).max(30),
        feedback: z.string().max(2000).optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const usageCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
      if (!usageCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You've reached your monthly AI script limit (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
        });
      }

      const profile = await getCreatorCoachProfile(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db
        .select()
        .from(planCards)
        .where(
          and(
            eq(planCards.workspaceId, ctx.workspaceId),
            inArray(planCards.id, input.ids)
          )
        );

      if (!existing.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cards not found" });
      }

      const goal = existing[0]?.goal ?? "grow";
      const response = await invokeLLM({
        messages: [
          {
            role: "user",
            content: withAiFormattingRules(
              buildPlanRegeneratePrompt(
                profile.niche,
                profile.targetAudience,
                goal,
                existing.map((c) => ({
                  day: c.day,
                  title: c.title,
                  angle: c.angle,
                  funnelStage: c.funnelStage,
                  contentFormat: c.contentFormat,
                  platform: c.platform,
                })),
                input.feedback
              )
            ),
          },
        ],
        maxTokens: 4096,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0]?.message?.content ?? "{}");
      const parsed = parseJsonFromLlm<unknown>(raw, null);
      const replacements = extractPlanCardsFromParsed<RawPlanCard>(parsed);
      if (!replacements.length) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Regeneration returned invalid results. Please try again.",
        });
      }

      const results = [];
      for (let i = 0; i < existing.length; i++) {
        const original = existing[i]!;
        const replacement = replacements[i];
        if (!replacement) continue;

        await db
          .update(planCards)
          .set({
            title: String(replacement.title ?? original.title).slice(0, 2000),
            hook: String(replacement.hook ?? original.hook).slice(0, 2000),
            angle: String(replacement.angle ?? original.angle).slice(0, 4000),
            contentFormat: String(replacement.contentFormat ?? original.contentFormat).slice(0, 32),
            platform: String(replacement.platform ?? original.platform).slice(0, 32),
            filmingLocation: String(replacement.filmingLocation ?? original.filmingLocation).slice(0, 500),
            researchSignal: replacement.researchSignal
              ? String(replacement.researchSignal).slice(0, 2000)
              : original.researchSignal,
            status: "pending",
          })
          .where(eq(planCards.id, original.id));

        const [updated] = await db.select().from(planCards).where(eq(planCards.id, original.id)).limit(1);
        if (updated) results.push(mapPlanCardRow(updated));
      }

      await incrementUsage(ctx.user.id, "recreateCount");
      return { cards: results };
    }),
});

export const studioRouter = router({
  getGenerationProgress: protectedProcedure.query(({ ctx }) => {
    return getCoachGenerationProgress(ctx.user.id);
  }),

  resolveIntent: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(8000),
        capabilityId: z
          .enum(["write_script", "from_plan", "refine_script", "hook_ideas"])
          .optional(),
        activeScriptId: z.number().optional(),
        attachedPlanCardId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [recent] = await db
        .select({ id: coachScripts.id })
        .from(coachScripts)
        .where(eq(coachScripts.workspaceId, ctx.workspaceId))
        .orderBy(desc(coachScripts.updatedAt))
        .limit(1);

      const action = await resolveCoachIntent({
        message: input.message,
        capabilityId: input.capabilityId as CoachCapabilityId | undefined,
        activeScriptId: input.activeScriptId ?? null,
        attachedPlanCardId: input.attachedPlanCardId ?? null,
        recentScriptId: recent?.id ?? null,
      });

      return action;
    }),

  analyze: protectedProcedure
    .input(z.object({ description: z.string().min(10).max(8000) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getCreatorCoachProfile(ctx.user.id);

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: withAiFormattingRules("You are a precise content strategist. Return only valid JSON."),
          },
          {
            role: "user",
            content: buildAnalysisPrompt(
              input.description,
              profile.niche,
              profile.targetAudience,
              profile.brandDescription
            ),
          },
        ],
        maxTokens: 1024,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0]?.message?.content ?? "{}");
      const analysis = parseJsonFromLlm<Record<string, unknown>>(raw, {});
      const fc = (analysis.factCheck as Record<string, unknown>) ?? {};

      return {
        confidence: typeof analysis.confidence === "number" ? analysis.confidence : 90,
        understood: String(analysis.understood ?? ""),
        gaps: Array.isArray(analysis.gaps) ? analysis.gaps.map(String) : [],
        questions: Array.isArray(analysis.questions)
          ? analysis.questions.map(String).slice(0, 2)
          : [],
        factCheck: {
          hasClaim: Boolean(fc.hasClaim),
          status: String(fc.status ?? "unverified"),
          claimSummary: fc.claimSummary ? String(fc.claimSummary) : null,
          warning: fc.warning ? String(fc.warning) : null,
          safeAngle: fc.safeAngle ? String(fc.safeAngle) : null,
        },
      };
    }),

  generate: protectedProcedure
    .input(
      z.object({
        description: z.string().min(10).max(8000),
        clarifications: z
          .array(z.object({ question: z.string(), answer: z.string() }))
          .optional()
          .default([]),
        planCardId: z.number().optional(),
        audienceSignalIds: z.array(z.number()).max(3).optional().default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return generateCoachScriptWithProgress({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        openId: ctx.user.openId,
        description: input.description,
        clarifications: input.clarifications,
        planCardId: input.planCardId,
        audienceSignalIds: input.audienceSignalIds,
      });
    }),

  convertRough: protectedProcedure
    .input(
      z.object({
        roughScript: z.string().min(20).max(12000),
        workingTitle: z.string().max(256).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return convertRoughScriptWithProgress({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        openId: ctx.user.openId,
        roughScript: input.roughScript,
        workingTitle: input.workingTitle,
      });
    }),

  refine: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        instruction: z.string().min(3).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCoachScriptInWorkspace(input.id, ctx.workspaceId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [script] = await db
        .select()
        .from(coachScripts)
        .where(eq(coachScripts.id, input.id))
        .limit(1);
      if (!script) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });

      const existingSections = parseCoachScriptSections({
        body: script.body,
        callToAction: script.callToAction,
        productionNotes: script.productionNotes,
      });

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: withAiFormattingRules(
              "You edit scripts while strictly preserving the HEIT structure. Return ONLY valid JSON."
            ),
          },
          {
            role: "user",
            content: `HOOK: ${script.hook}\nEXPLAIN: ${existingSections.explain}\nILLUSTRATE: ${existingSections.illustrate}\nTEACH: ${existingSections.teach}\nCTA: ${existingSections.cta}\n\nInstruction: ${input.instruction}\n\nReturn: {"hook":"...","explain":"...","illustrate":"...","teach":"...","cta":"..."}`,
          },
        ],
        maxTokens: 2048,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0]?.message?.content ?? "{}");
      const refinedPayload = normalizeCoachScriptPayload(
        parseJsonFromLlm<Record<string, unknown>>(raw, {})
      );
      const sections = sectionsFromGenerated({
        ...refinedPayload,
        explain: refinedPayload.explain ?? existingSections.explain,
        illustrate: refinedPayload.illustrate ?? existingSections.illustrate,
        teach: refinedPayload.teach ?? existingSections.teach,
        cta: refinedPayload.cta ?? refinedPayload.callToAction ?? existingSections.cta,
        hook: refinedPayload.hook ?? script.hook,
      });

      const notes = parseProductionNotes(script.productionNotes);
      const productionNotes = buildProductionNotesJson(
        notes ?? {},
        sections,
        { contentFormat: script.contentFormat ?? undefined }
      );

      await db
        .update(coachScripts)
        .set({
          hook: String(refinedPayload.hook ?? script.hook),
          body: combineBodyFromSections(sections),
          callToAction: sections.cta || sections.teach,
          productionNotes,
        })
        .where(eq(coachScripts.id, input.id));

      const [updated] = await db.select().from(coachScripts).where(eq(coachScripts.id, input.id)).limit(1);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });

      return mapCoachScriptRow(updated);
    }),

  hookVariations: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertCoachScriptInWorkspace(input.id, ctx.workspaceId);
      const profile = await getCreatorCoachProfile(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [script] = await db
        .select()
        .from(coachScripts)
        .where(eq(coachScripts.id, input.id))
        .limit(1);
      if (!script) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });

      const response = await invokeLLM({
        messages: [
          {
            role: "user",
            content: withAiFormattingRules(
              buildHookVariationsPrompt(
                script.hook,
                script.body,
                script.callToAction,
                profile.niche,
                profile.targetAudience
              )
            ),
          },
        ],
        maxTokens: 1024,
        response_format: { type: "json_object" },
      });

      const raw = String(response.choices[0]?.message?.content ?? "{}");
      const variations = parseJsonFromLlm<Record<string, string>>(raw, {});

      return {
        context: variations.context ?? "",
        contrarian: variations.contrarian ?? "",
        intrigue: variations.intrigue ?? "",
      };
    }),

  applyHook: protectedProcedure
    .input(z.object({ id: z.number(), hook: z.string().min(3).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await assertCoachScriptInWorkspace(input.id, ctx.workspaceId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(coachScripts)
        .set({ hook: input.hook.trim() })
        .where(eq(coachScripts.id, input.id));

      const [updated] = await db.select().from(coachScripts).where(eq(coachScripts.id, input.id)).limit(1);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });

      return {
        id: updated.id,
        hook: updated.hook,
        body: updated.body,
        callToAction: updated.callToAction,
      };
    }),

  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional().default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const limit = input?.limit ?? 20;
      const rows = await db
        .select()
        .from(coachScripts)
        .where(eq(coachScripts.workspaceId, ctx.workspaceId))
        .orderBy(desc(coachScripts.updatedAt))
        .limit(limit);
      return { scripts: rows.map(mapCoachScriptSummary) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertCoachScriptInWorkspace(input.id, ctx.workspaceId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [row] = await db
        .select()
        .from(coachScripts)
        .where(and(eq(coachScripts.id, input.id), eq(coachScripts.workspaceId, ctx.workspaceId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
      return mapCoachScriptRow(row);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        hook: z.string().min(1).max(2000),
        explain: z.string().max(8000),
        illustrate: z.string().max(8000),
        teach: z.string().max(4000),
        cta: z.string().max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCoachScriptInWorkspace(input.id, ctx.workspaceId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [script] = await db
        .select()
        .from(coachScripts)
        .where(eq(coachScripts.id, input.id))
        .limit(1);
      if (!script) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });

      const sections = {
        explain: input.explain.trim(),
        illustrate: input.illustrate.trim(),
        teach: input.teach.trim(),
        cta: input.cta.trim(),
      };
      const notes = parseProductionNotes(script.productionNotes);
      const productionNotes = buildProductionNotesJson(notes ?? {}, sections, {
        contentFormat: script.contentFormat ?? undefined,
        funnelStage: notes?.funnelStage,
      });

      await db
        .update(coachScripts)
        .set({
          hook: input.hook.trim(),
          body: combineBodyFromSections(sections),
          callToAction: sections.cta || sections.teach,
          productionNotes,
        })
        .where(eq(coachScripts.id, input.id));

      const [updated] = await db.select().from(coachScripts).where(eq(coachScripts.id, input.id)).limit(1);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
      return mapCoachScriptRow(updated);
    }),

  saveToLibrary: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertCoachScriptInWorkspace(input.id, ctx.workspaceId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [script] = await db
        .select()
        .from(coachScripts)
        .where(eq(coachScripts.id, input.id))
        .limit(1);
      if (!script) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });

      const sections = parseCoachScriptSections({
        body: script.body,
        callToAction: script.callToAction,
        productionNotes: script.productionNotes,
      });
      const content = flattenViralScriptForCopy({
        title: script.title,
        hook: script.hook,
        sections,
      });

      const savedId = await createSavedScript({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        title: script.title,
        content,
        originalContent: content,
        wordCount: countWords(content),
        status: "draft",
        notes: "Saved from AI Coach",
        coachScriptId: script.id,
      });

      return { savedScriptId: savedId, coachScriptId: script.id };
    }),
});
