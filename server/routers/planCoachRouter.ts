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
  detectsClearCreativeFormat,
  filterCoachClarificationQuestions,
} from "@shared/coachAnalyze";
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
import { getDb, createSavedScript, getSavedScriptByCoachScriptId, updateSavedScript, ensureDefaultTags } from "../db";
import { getCreatorCoachProfile } from "../planCoachProfile";
import { resolveCoachIntent } from "../studioCoachAgent";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import {
  getAudienceSignalsByIds,
  getOrFetchAudienceSignals,
} from "../audienceResearch/service";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { generateCoachScriptWithProgress, convertRoughScriptWithProgress, getCoachGenerationProgress } from "../coachGenerateWithProgress";
import { importRemakeScriptToStudioForWorkspace } from "../importRemakeToStudio";
import { invokeCoachScriptJudge } from "../coachScriptJudge";
import { FIX_CTA_REFINE_INSTRUCTION, isVagueCoachCta } from "@shared/coachScriptHealth";
import type { CoachScriptJudgeMeta } from "@shared/coachScriptSections";
import {
  assignScriptingTag,
  enrichIdeaSavedScriptInBackground,
  pickAutoPostSchedule,
} from "../ideaScriptExtras";
import { generateSeoInstagramCaption } from "../generateSeoCaption";
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

function sparkTitleFromNote(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return "New spark";
  const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
  const firstSentence = firstLine.split(/[.!?]/)[0]?.trim() ?? firstLine;
  const title = firstSentence || firstLine;
  return title.slice(0, 120) || "New spark";
}

function mapPlanCardRow(
  row: typeof planCards.$inferSelect,
  extras?: { coachScriptId?: number | null }
) {
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
    sourceType: row.sourceType,
    sourceReelId: row.sourceReelId,
    sourceFeaturedReelId: row.sourceFeaturedReelId,
    sourceReelHandle: row.sourceReelHandle,
    userRawNote: row.userRawNote,
    coachScriptId: extras?.coachScriptId ?? null,
    createdAt: row.createdAt,
  };
}

function mapCoachScriptSummary(row: typeof coachScripts.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    hookPreview: row.hook.slice(0, 280),
    bodyPreview: row.body.slice(0, 400),
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
    productionNotesStatus: row.productionNotesStatus ?? null,
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

        await db
          .delete(planCards)
          .where(
            and(
              eq(planCards.workspaceId, ctx.workspaceId),
              eq(planCards.sourceType, "ai_pick")
            )
          );

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
            sourceType: "ai_pick" as const,
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
          cards: inserted.map((row) => mapPlanCardRow(row)),
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
      .orderBy(asc(planCards.day), desc(planCards.createdAt));

    const sparkRows = rows.filter((row) => row.sourceType === "user_spark" || row.day === 0);
    const calendarRows = rows.filter((row) => row.sourceType !== "user_spark" && row.day > 0);

    const allIds = rows.map((row) => row.id);
    const scriptByPlanCardId = new Map<number, number>();
    if (allIds.length > 0) {
      const linkedScripts = await db
        .select({
          id: coachScripts.id,
          planCardId: coachScripts.planCardId,
        })
        .from(coachScripts)
        .where(
          and(
            eq(coachScripts.workspaceId, ctx.workspaceId),
            inArray(coachScripts.planCardId, allIds)
          )
        )
        .orderBy(desc(coachScripts.createdAt));
      for (const script of linkedScripts) {
        if (script.planCardId == null) continue;
        if (!scriptByPlanCardId.has(script.planCardId)) {
          scriptByPlanCardId.set(script.planCardId, script.id);
        }
      }
    }

    const withScript = (row: typeof planCards.$inferSelect) =>
      mapPlanCardRow(row, { coachScriptId: scriptByPlanCardId.get(row.id) ?? null });

    const sparkCards = sparkRows
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(withScript);
    const calendarCards = calendarRows
      .slice()
      .sort((a, b) => a.day - b.day)
      .map(withScript);

    return {
      cards: [...sparkCards, ...calendarCards],
      sparkCards,
      calendarCards,
    };
  }),

  dismissSpark: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [card] = await db
        .select()
        .from(planCards)
        .where(
          and(eq(planCards.id, input.id), eq(planCards.workspaceId, ctx.workspaceId))
        )
        .limit(1);

      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Spark not found" });
      }

      const isSpark = card.sourceType === "user_spark" || card.day === 0;
      if (!isSpark) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only Spark Deck ideas can be dismissed here.",
        });
      }

      await db
        .delete(planCards)
        .where(
          and(eq(planCards.id, input.id), eq(planCards.workspaceId, ctx.workspaceId))
        );

      return { success: true as const, id: input.id };
    }),

  captureSpark: protectedProcedure
    .input(
      z
        .object({
          note: z.string().min(3).max(2000),
          reelId: z.number().optional(),
          featuredReelId: z.number().optional(),
          reelHandle: z.string().max(128).optional(),
          reelCaption: z.string().max(2000).optional(),
        })
        .refine((v) => !(v.reelId != null && v.featuredReelId != null), {
          message: "Pass reelId or featuredReelId, not both",
        })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const note = input.note.trim();
      const title = sparkTitleFromNote(note);
      const hook =
        note.length <= 200 ? note : `${note.slice(0, 197).trimEnd()}...`;

      const insertResult = await db.insert(planCards).values({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          day: 0,
          funnelStage: "tofu",
          contentFormat: "talking-head",
          platform: "instagram",
          title,
          hook,
          angle: note,
          filmingLocation: "Wherever you film",
          researchSignal: input.reelCaption ? input.reelCaption.slice(0, 2000) : null,
          status: "pending",
          goal: null,
          sourceType: "user_spark",
          sourceReelId: input.reelId ?? null,
          sourceFeaturedReelId: input.featuredReelId ?? null,
          sourceReelHandle: input.reelHandle?.replace(/^@/, "").slice(0, 128) ?? null,
          userRawNote: note,
        });

      const cardId = insertResult[0]?.insertId;
      if (!cardId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save spark" });
      }

      const [row] = await db.select().from(planCards).where(eq(planCards.id, cardId)).limit(1);
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load saved spark" });
      }

      return { card: mapPlanCardRow(row) };
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

      return { cards: updated.map((row) => mapPlanCardRow(row)) };
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

      let confidence = typeof analysis.confidence === "number" ? analysis.confidence : 90;
      let questions = Array.isArray(analysis.questions)
        ? analysis.questions.map(String).slice(0, 2)
        : [];

      questions = filterCoachClarificationQuestions(input.description, questions);
      if (detectsClearCreativeFormat(input.description) && questions.length === 0) {
        confidence = Math.max(confidence, 88);
      }

      return {
        confidence,
        understood: String(analysis.understood ?? ""),
        gaps: Array.isArray(analysis.gaps) ? analysis.gaps.map(String) : [],
        questions,
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

  importRemake: protectedProcedure
    .input(
      z.object({
        script: z.string().min(20).max(12000),
        title: z.string().max(256).optional(),
        sourceHandle: z.string().max(128).optional(),
        sourceCaption: z.string().max(2000).optional(),
        platformLabel: z
          .enum(["Instagram Reel", "TikTok video", "YouTube Short"])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return importRemakeScriptToStudioForWorkspace({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        flatScript: input.script,
        title: input.title,
        sourceHandle: input.sourceHandle,
        sourceCaption: input.sourceCaption,
        platformLabel: input.platformLabel,
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
      let refinedPayload = normalizeCoachScriptPayload(
        parseJsonFromLlm<Record<string, unknown>>(raw, {})
      );
      let sections = sectionsFromGenerated({
        ...refinedPayload,
        explain: refinedPayload.explain ?? existingSections.explain,
        illustrate: refinedPayload.illustrate ?? existingSections.illustrate,
        teach: refinedPayload.teach ?? existingSections.teach,
        cta: refinedPayload.cta ?? refinedPayload.callToAction ?? existingSections.cta,
        hook: refinedPayload.hook ?? script.hook,
      });

      // Fix-weakest CTA path: if the model left a vague CTA, force one specific rewrite.
      const wantsCtaFix =
        /call to action|\bcta\b/i.test(input.instruction) &&
        /rewrite only|specific|comment/i.test(input.instruction);
      if (wantsCtaFix && isVagueCoachCta(sections.cta)) {
        const ctaPass = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You write specific short-form CTAs. Return ONLY valid JSON with a cta field."
              ),
            },
            {
              role: "user",
              content: `${FIX_CTA_REFINE_INSTRUCTION}

Current hook: ${String(refinedPayload.hook ?? script.hook)}
Current takeaway: ${sections.teach}
Current weak CTA: ${sections.cta || "(empty)"}

Return: {"cta":"..."}`,
            },
          ],
          maxTokens: 256,
          response_format: { type: "json_object" },
        });
        const ctaRaw = String(ctaPass.choices[0]?.message?.content ?? "{}");
        const ctaPayload = normalizeCoachScriptPayload(
          parseJsonFromLlm<Record<string, unknown>>(ctaRaw, {})
        );
        const nextCta = String(ctaPayload.cta ?? ctaPayload.callToAction ?? "").trim();
        if (nextCta && !isVagueCoachCta(nextCta)) {
          sections = { ...sections, cta: nextCta };
          refinedPayload = { ...refinedPayload, cta: nextCta };
        }
      }

      const notes = parseProductionNotes(script.productionNotes);
      const hook = String(refinedPayload.hook ?? script.hook);

      let coachJudge: CoachScriptJudgeMeta | undefined = notes?.coachJudge;
      try {
        const profile = await getCreatorCoachProfile(ctx.user.id);
        const judged = await invokeCoachScriptJudge(
          {
            description: notes?.sourceDescription?.trim() || script.title || "Script refine",
            niche: profile.niche || "General",
            targetAudience: profile.targetAudience || "Short-form viewers",
            brandDescription: profile.brandDescription,
          },
          {
            title: script.title,
            hook,
            explain: sections.explain,
            illustrate: sections.illustrate,
            teach: sections.teach,
            cta: sections.cta,
          }
        );
        coachJudge = {
          overallScore: judged.overallScore,
          hookEffectiveness: judged.hookEffectiveness,
          viewerSense: judged.viewerSense,
          nicheFit: judged.nicheFit,
          skipRatePrediction: judged.skipRatePrediction,
          ctaQuality: judged.ctaQuality,
          verdictPass: judged.verdictPass,
          regenCount: notes?.coachJudge?.regenCount,
        };
      } catch (err) {
        console.warn("[studio.refine] re-judge failed; keeping prior coachJudge", err);
      }

      const productionNotes = buildProductionNotesJson(notes ?? {}, sections, {
        contentFormat: script.contentFormat ?? notes?.contentFormat ?? undefined,
        funnelStage: notes?.funnelStage,
        scriptMode: notes?.scriptMode,
        hookType: notes?.hookType,
        sourceDescription: notes?.sourceDescription,
        coachJudge,
      });

      await db
        .update(coachScripts)
        .set({
          hook,
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

  /** 30s Apple Music / iTunes preview for Instagram audio title+artist picks. */
  resolveAudioPreview: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        artist: z.string().trim().max(200).optional(),
      })
    )
    .query(async ({ input }) => {
      const { resolveItunesAudioPreview } = await import("../itunesAudioPreview");
      const preview = await resolveItunesAudioPreview({
        title: input.title,
        artist: input.artist,
      });
      if (!preview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No audio preview found. Search this track in Instagram Reels audio.",
        });
      }
      return preview;
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
        hookVisualBeat: z.string().max(2000).optional(),
        hookOnScreenText: z.string().max(200).optional(),
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
      const notes = parseProductionNotes(script.productionNotes) ?? {};
      const onScreen =
        input.hookOnScreenText !== undefined
          ? input.hookOnScreenText.trim()
          : notes.hookOnScreenText?.trim() || notes.textOverlay?.trim() || "";
      const visualBeat =
        input.hookVisualBeat !== undefined
          ? input.hookVisualBeat.trim()
          : notes.hookVisualBeat?.trim() || "";
      const productionNotes = buildProductionNotesJson(
        {
          ...notes,
          hookVisualBeat: visualBeat,
          hookOnScreenText: onScreen,
          frame0OnScreenText: onScreen,
          textOverlay: onScreen || notes.textOverlay,
        },
        sections,
        {
          contentFormat: script.contentFormat ?? undefined,
          funnelStage: notes.funnelStage,
        }
      );

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

  generateCaption: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        style: z
          .enum(["storytelling", "question", "cta", "educational", "curiosity", "bold", "relatable"])
          .optional()
          .default("educational"),
        captionLength: z.enum(["auto", "short", "medium", "long"]).optional().default("auto"),
        niche: z.string().max(200).optional(),
        brandHashtag: z.string().max(100).optional(),
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

      const profile = await getCreatorCoachProfile(ctx.user.id);

      try {
        const result = await generateSeoInstagramCaption({
          content,
          style: input.style,
          captionLength: input.captionLength,
          niche: input.niche?.trim() || profile.niche,
          brandHashtag: input.brandHashtag,
          targetAudience: profile.targetAudience,
        });

        const existing = await getSavedScriptByCoachScriptId(script.id, ctx.workspaceId);
        if (existing) {
          await updateSavedScript(existing.id, {
            generatedCaption: result.caption,
            generatedHashtags: JSON.stringify(result.hashtags),
            captionStyle: result.style,
          } as any);
        }

        return {
          caption: result.caption,
          hashtags: result.hashtags,
          primaryKeyword: result.primaryKeyword,
          hookType: result.hookType,
          style: result.style,
        };
      } catch (err) {
        console.error(`[studio.generateCaption] failed for coach script ${input.id}:`, err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not generate caption. Try again.",
        });
      }
    }),

  saveToLibrary: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        addToCalendar: z.boolean().optional().default(true),
        postDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        postTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        notes: z.string().trim().max(2000).optional().nullable(),
        generatedCaption: z.string().trim().max(5000).optional().nullable(),
        generatedHashtags: z.array(z.string().trim().max(100)).max(15).optional(),
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
      const wordCount = countWords(content);

      const schedule = input.addToCalendar
        ? input.postDate
          ? {
              postDate: new Date(`${input.postDate}T12:00:00`),
              postTime: input.postTime ?? "09:00",
            }
          : pickAutoPostSchedule()
        : null;

      const notesTrimmed = input.notes?.trim() ?? "";
      const notes = notesTrimmed || "Saved from AI Coach";

      const captionTrimmed = input.generatedCaption?.trim() || "";
      const hashtagsClean = (input.generatedHashtags ?? [])
        .map((h) => h.replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 10);
      const captionFields =
        captionTrimmed || hashtagsClean.length > 0
          ? {
              generatedCaption: captionTrimmed || null,
              generatedHashtags:
                hashtagsClean.length > 0 ? JSON.stringify(hashtagsClean) : null,
              captionStyle: "educational" as const,
            }
          : null;

      const existing = await getSavedScriptByCoachScriptId(script.id, ctx.workspaceId);

      if (existing) {
        await updateSavedScript(existing.id, {
          title: script.title,
          content,
          wordCount,
          postDate: schedule?.postDate ?? null,
          postTime: schedule?.postTime ?? null,
          notes,
          ...(captionFields ?? {}),
        });
        if (!captionFields && !existing.generatedCaption) {
          enrichIdeaSavedScriptInBackground(existing.id, content).catch((err) =>
            console.error(`[studio.saveToLibrary] Background caption failed for ${existing.id}:`, err)
          );
        }
        return {
          savedScriptId: existing.id,
          coachScriptId: script.id,
          updated: true as const,
        };
      }

      await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
      const savedId = await createSavedScript({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        title: script.title,
        content,
        originalContent: content,
        wordCount,
        status: "draft",
        notes,
        coachScriptId: script.id,
        postDate: schedule?.postDate ?? null,
        postTime: schedule?.postTime ?? null,
        ...(captionFields ?? {}),
      });

      await assignScriptingTag(savedId, ctx.workspaceId, ctx.user.id);

      if (!captionFields) {
        enrichIdeaSavedScriptInBackground(savedId, content).catch((err) =>
          console.error(`[studio.saveToLibrary] Background caption failed for ${savedId}:`, err)
        );
      }

      return {
        savedScriptId: savedId,
        coachScriptId: script.id,
        updated: false as const,
      };
    }),
});
