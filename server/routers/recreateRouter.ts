import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { tiktokVideos, youtubeVideos, recreatedScripts } from "../../drizzle/schema";
import type { Reel } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { capturePostHogEvent, posthogDistinctIdForUser } from "../analytics/posthogServer";
import { assertRecreatedScriptInWorkspace } from "../assertRecreatedScriptInWorkspace";
import { assertUserScrapeReelInWorkspace } from "../assertUserScrapeReelInWorkspace";
import { getOrFetchAudienceSignals } from "../audienceResearch/service";
import { getTranscriptionByReelId, getFeaturedReelById, getTranscriptionByFeaturedReelId, getDb, getTranscriptionByTiktokVideoId, getTranscriptionByYoutubeVideoId, createRecreatedScript, getReelById, getRecreatedScriptsByFeaturedReelId, getRecreatedScriptsByTiktokVideoId, getRecreatedScriptsByYoutubeVideoId, getRecreatedScriptsByReelId, updateRecreatedScript, getRecreatedScript } from "../db";
import { getCreatorCoachProfile } from "../planCoachProfile";
import { generateRemakeContent } from "../recreate/generateRemakeContent";
import { analyzeRemakeStructure } from "../recreate/remakeStructure";
import {
  formatResearchGroundingForPrompt,
  getResearchGrounding,
} from "../studioResearchGrounding";
import { getPlanLimits } from "../stripe/products";
import { dispatchPilotJob } from "../durableJobs/dispatch";
import type { PlanId } from "../stripe/products";
import { checkUsageLimit, incrementUsage, getUserSubscription } from "../stripe/stripe-service";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import { buildRecreateTopicPrompt, buildRecreateDefaultTopicPrompt, RECREATE_EXPLICIT_ANGLE_RULES } from "@shared/recreateAnglePrompt";
import { buildRemakeScriptCompletedProps, buildRemakeScriptFailedProps } from "@shared/scriptGenerationAnalytics";
import { and, or, not, eq, inArray, like } from "drizzle-orm";
import { isFirstRemakeUsageBypassEligible, maybeMarkFirstSpyCompletedFromFeaturedScript } from "./_shared";

function buildDeliveryCuesPromptSection(): string {
  return `
**DELIVERY CUES:** Add performance/delivery cues in square brackets throughout the script to guide the speaker on HOW to deliver each line. These cues should be based on analyzing the viral structure and what makes the original engaging. Use cues like:
- [PAUSE] - dramatic pause for emphasis
- [LEAN IN] - get closer to camera, create intimacy
- [SPEED UP] - increase pace for energy/urgency
- [SLOW DOWN] - slow pace for emphasis on key point
- [WHISPER] - lower voice for dramatic effect
- [EMPHASIZE] - stress the next word/phrase
- [LOOK AT CAMERA] - direct eye contact moment
- [GESTURE] - use hand gesture to illustrate
- [RAISE VOICE] - increase volume for impact
- [SMILE] - show enthusiasm/warmth
- [SERIOUS FACE] - convey gravity/importance
- [COUNT ON FINGERS] - enumerate points visually
- [SHAKE HEAD] - express disagreement/disbelief
- [NOD] - affirm the point being made

Place cues at the START of the line they apply to. Every 2-3 lines should have a cue. The cues should create a dynamic, engaging delivery that keeps viewer attention throughout.`;
}


export async function runScriptGeneration(
  scriptId: number,
  userId: number,
  originalTranscript: string,
  segments: unknown,
  caption: string,
  reel: any,
  topic: string,
  gradeLevel: string,
  addCues: boolean,
  platformLabel: "Instagram Reel" | "TikTok video" | "YouTube Short" = "Instagram Reel"
): Promise<void> {
  try {
    const profile = await getCreatorCoachProfile(userId).catch(() => null);
    const researchIdea =
      topic === "SAME_TOPIC"
        ? caption || originalTranscript.slice(0, 300)
        : topic;

    const groundingStarted = Date.now();
    const [researchItems, structureResult] = await Promise.all([
      getResearchGrounding(researchIdea, profile?.niche ?? "business"),
      analyzeRemakeStructure({
        originalTranscript,
        caption,
        sourceKey:
          typeof reel?.shortcode === "string" && reel.shortcode.trim()
            ? reel.shortcode.trim()
            : undefined,
        platformLabel,
      }),
    ]);
    console.info("[RemakeLatency] web_grounding_parallel_ms", Date.now() - groundingStarted, {
      researchCount: researchItems.length,
      structureCacheHit: structureResult.cacheHit,
    });

    const researchGroundingBlock = formatResearchGroundingForPrompt(researchItems);
    const generated = await generateRemakeContent({
      originalTranscript,
      caption,
      reel,
      sourceKey:
        typeof reel?.shortcode === "string" && reel.shortcode.trim()
          ? reel.shortcode.trim()
          : undefined,
      topic,
      gradeLevel,
      addCues,
      researchGroundingBlock,
      trustedResearchTexts: researchItems.flatMap((item) => [
        item.title,
        item.snippet ?? "",
        item.sourceUrl,
      ]),
      platformLabel,
      viralStructureOverride: structureResult.structure,
    });

    await updateRecreatedScript(scriptId, {
      viralStructure: generated.viralStructure as any,
      generatedScript: generated.generatedScript,
      readabilityAnalysis: generated.readabilityAnalysis as any,
      status: "completed",
    });
    await maybeMarkFirstSpyCompletedFromFeaturedScript(scriptId);

    const stored = await getRecreatedScript(scriptId);
    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(userId),
      event: "remake_script_completed",
      properties: buildRemakeScriptCompletedProps({
        scriptId,
        userId,
        topic: stored?.topic ?? topic,
        generatedScript: generated.generatedScript,
      }),
    });
  } catch (error) {
    const message = formatIdeaScriptErrorForUser(error, "remake");
    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(userId),
      event: "remake_script_failed",
      properties: buildRemakeScriptFailedProps({
        scriptId,
        userId,
        topic,
        errorMessage: message,
      }),
    });
    await updateRecreatedScript(scriptId, {
      status: "failed",
      errorMessage: message,
    });
  }
}

async function runScriptRewrite(
  scriptId: number,
  existingScript: string,
  viralStructure: Record<string, unknown> | null,
  originalTranscript: string,
  caption: string,
  gradeLevel: string,
  targetDuration: string,
  addCues: boolean,
  angle?: string,
  explicitUserAngle = false
): Promise<void> {
  try {
    const gradeLevelInstruction = gradeLevel === "auto"
      ? "Choose the most appropriate grade level (between Grade 2-8) based on the topic and audience."
      : `Write at a Grade ${gradeLevel} reading level. Use simple vocabulary and short sentences appropriate for that grade level.`;

    // Calculate target word count based on duration (average speaking pace ~150 words/minute)
    let durationInstruction = "";
    if (targetDuration !== "any") {
      const seconds = parseInt(targetDuration);
      const targetWords = Math.round((seconds / 60) * 150);
      const minWords = Math.round(targetWords * 0.85);
      const maxWords = Math.round(targetWords * 1.15);
      durationInstruction = `\n**TARGET DURATION:** ${seconds} seconds (~${targetWords} words). Keep the script between ${minWords}-${maxWords} words. Cut or expand content as needed while preserving the viral structure.`;
    }

    let cuesInstruction = "";
    if (addCues) {
      cuesInstruction = buildDeliveryCuesPromptSection();
    }

    const angleBlock = angle
      ? `\n**NEW ANGLE/TOPIC:**\n${angle}\n${explicitUserAngle ? `\n${RECREATE_EXPLICIT_ANGLE_RULES}\n` : ""}`
      : "";
    const topicInstruction = angle
      ? explicitUserAngle
        ? "Rewrite the script for the NEW ANGLE/TOPIC above. The angle is ground truth for subject and message. Keep the proven viral structure but change the subject, examples, and message to match the new angle. Ignore the literal topic of the current script and source transcript unless the angle asks for it."
        : "Rewrite the script for the NEW ANGLE/TOPIC above. Keep the proven viral structure but change the subject, examples, and message to match the new angle."
      : "Rewrite the script maintaining the same topic, message, and viral structure.";
    const captionBlock = caption ? `\n**SOURCE REEL CAPTION:**\n${caption}\n` : "";

    const rewritePrompt = `You are an expert Instagram Reels scriptwriter. Rewrite the following script with the specified adjustments.

**CURRENT SCRIPT:**
${existingScript}

${viralStructure ? `**VIRAL STRUCTURE (preserve this pattern):**\n${JSON.stringify(viralStructure, null, 2)}` : ""}

${originalTranscript ? `**ORIGINAL VIRAL TRANSCRIPT (for reference):**\n${originalTranscript}` : ""}
${captionBlock}${angleBlock}
**READABILITY REQUIREMENT:**
${gradeLevelInstruction}
${durationInstruction}
${cuesInstruction}

**INSTRUCTIONS:**
1. ${topicInstruction}
2. Adjust the vocabulary and sentence complexity to match the target grade level.
3. ${targetDuration !== "any" ? `Adjust the length to fit approximately ${targetDuration} seconds of speaking time.` : "Keep similar length."}
4. ${addCues ? "Add delivery cues in [BRACKETS] throughout to guide performance. Make cues specific and actionable." : "Do NOT add any delivery cues or stage directions."}
5. Keep the same hook pattern type, body pacing style, transition technique, and CTA style from the viral structure.
6. Write as natural spoken text with short paragraphs for natural pauses.
7. Do NOT include labels like "Hook:" or "Body:" - just write the flowing script${addCues ? " with [CUES] inline" : ""}.`;

    const scriptResponse = await invokeLLM({
      messages: [
        { role: "system", content: withAiFormattingRules("You are an expert Instagram Reels scriptwriter. Write natural, spoken scripts that match viral patterns.") },
        { role: "user", content: rewritePrompt },
      ],
    });

    const rewrittenScript = String(scriptResponse.choices[0].message.content || "");

    // Run readability analysis on the rewritten script
    const hemingwayPrompt = `You are a readability analysis engine. Analyze the following script and return a JSON response.

**SCRIPT:**
${rewrittenScript}

**TARGET GRADE LEVEL:** ${gradeLevel === "auto" ? "Auto-detect appropriate level" : `Grade ${gradeLevel}`}

Return a JSON object with:
{
  "gradeLevel": number (the Flesch-Kincaid grade level of the text),
  "readingEase": number (Flesch reading ease score, 0-100),
  "wordCount": number,
  "sentenceCount": number,
  "avgWordsPerSentence": number,
  "issues": [
    {
      "type": "passive_voice" | "complex_sentence" | "adverb" | "hard_to_read" | "very_hard_to_read",
      "text": "the exact problematic text",
      "suggestion": "brief suggestion for improvement"
    }
  ],
  "passiveVoiceCount": number,
  "adverbCount": number,
  "hardSentenceCount": number,
  "veryHardSentenceCount": number,
  "overallAssessment": "string - brief assessment of readability"
}

Return ONLY valid JSON.`;

    const hemingwayResponse = await invokeLLM({
      messages: [
        { role: "system", content: withAiFormattingRules("You are a readability analysis engine. Always respond with valid JSON only.") },
        { role: "user", content: hemingwayPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "readability_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              gradeLevel: { type: "number" },
              readingEase: { type: "number" },
              wordCount: { type: "number" },
              sentenceCount: { type: "number" },
              avgWordsPerSentence: { type: "number" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    text: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["type", "text", "suggestion"],
                  additionalProperties: false,
                },
              },
              passiveVoiceCount: { type: "number" },
              adverbCount: { type: "number" },
              hardSentenceCount: { type: "number" },
              veryHardSentenceCount: { type: "number" },
              overallAssessment: { type: "string" },
            },
            required: [
              "gradeLevel", "readingEase", "wordCount", "sentenceCount",
              "avgWordsPerSentence", "issues", "passiveVoiceCount", "adverbCount",
              "hardSentenceCount", "veryHardSentenceCount", "overallAssessment"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    let readabilityAnalysis: Record<string, unknown>;
    try {
      readabilityAnalysis = sanitizeAiOutputDeep(
        JSON.parse((String(hemingwayResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
      );
    } catch {
      readabilityAnalysis = { error: "Failed to parse readability analysis" };
    }

    // Preserve the original viral structure
    await updateRecreatedScript(scriptId, {
      viralStructure: viralStructure as any,
      generatedScript: String(rewrittenScript),
      readabilityAnalysis: readabilityAnalysis as any,
      status: "completed",
    });
  } catch (error) {
    const message = formatIdeaScriptErrorForUser(error, "remake");
    await updateRecreatedScript(scriptId, {
      status: "failed",
      errorMessage: message,
    });
  }
}


export const recreateRouter = router({
    /** Start script re-creation: analyze viral structure + generate new script */
    generate: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
            topic: z.string().max(2000).optional().default(""),
            gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6", "7", "8"]),
            /** When true and plan allows AI cues, first-generation matches Rewrite behavior. */
            addCues: z.boolean().optional().default(true),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        const source: "user" | "featured" | "tiktok" | "youtube" =
          input.featuredReelId != null
            ? "featured"
            : input.tiktokVideoId != null
              ? "tiktok"
              : input.youtubeVideoId != null
                ? "youtube"
                : "user";
        let caption = "";
        let transcription: Awaited<ReturnType<typeof getTranscriptionByReelId>>;
        let reelForGeneration: any;

        if (source === "featured") {
          const fr = await getFeaturedReelById(input.featuredReelId!);
          if (!fr) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Featured reel not found" });
          }
          caption = fr.caption ?? "";
          reelForGeneration = fr;
          transcription = await getTranscriptionByFeaturedReelId(input.featuredReelId!);
        } else if (source === "tiktok") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }
          const rows = await db
            .select()
            .from(tiktokVideos)
            .where(eq(tiktokVideos.id, input.tiktokVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "TikTok video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          caption = video.caption ?? "";
          reelForGeneration = video;
          transcription = await getTranscriptionByTiktokVideoId(video.id);
        } else if (source === "youtube") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }
          const rows = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.id, input.youtubeVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "YouTube video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          caption = video.title ?? "";
          reelForGeneration = video;
          transcription = await getTranscriptionByYoutubeVideoId(video.id);
        } else {
          const reel = await assertUserScrapeReelInWorkspace(input.reelId!, ctx);
          caption = reel.caption ?? "";
          reelForGeneration = reel;
          transcription = await getTranscriptionByReelId(input.reelId!);
        }

        if (!transcription || transcription.status !== "completed" || !transcription.transcript) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Reel must be transcribed first before re-creating a script.",
          });
        }

        // Check usage limit before generating (first script generation is free)
        const bypassRecreateLimit = await isFirstRemakeUsageBypassEligible(
          ctx.user.id,
          ctx.user.hasCompletedFirstSpy,
          "recreateCount"
        );
        if (!bypassRecreateLimit) {
          const usageCheck = await checkUsageLimit(
            ctx.user.id,
            "recreateCount",
            ctx.user.openId
          );
          if (!usageCheck.allowed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `You've reached your monthly AI re-creation limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
            });
          }
        }

        const typed = input.topic.trim();
        const biz = (ctx.user.businessDescription ?? "").trim();
        const aud = (ctx.user.targetAudience ?? "").trim();

        const hasExplicitUserAngle = typed.length > 0;

        let promptAngle: string;
        if (hasExplicitUserAngle) {
          promptAngle = buildRecreateTopicPrompt({
            angle: typed,
            targetAudience: aud || null,
            businessDescription: biz || null,
          });
        } else if (aud || biz) {
          const profile = await getCreatorCoachProfile(ctx.user.id);
          const { signals } = await getOrFetchAudienceSignals({
            workspaceId: ctx.workspaceId,
            nicheSlug: profile.nicheSlug,
            nicheLabel: profile.niche,
            targetAudience: profile.targetAudience,
          });
          promptAngle = buildRecreateDefaultTopicPrompt({
            niche: profile.niche,
            targetAudience: profile.targetAudience,
            businessDescription: biz || profile.brandDescription,
            audienceResearchBlock: formatAudienceSignalsForPrompt(signals.slice(0, 5)),
          });
        } else {
          promptAngle = "SAME_TOPIC";
        }

        // storedTopic = what we persist to recreated_scripts.topic (for display, NOT the prompt)
        let storedTopic: string;
        if (typed) storedTopic = typed;
        else if (promptAngle === "SAME_TOPIC") storedTopic = "SAME_TOPIC";
        else storedTopic = "Personalized";

        // Track usage
        await incrementUsage(ctx.user.id, "recreateCount");

        const scriptId = await createRecreatedScript({
          reelId: source === "user" ? input.reelId! : null,
          featuredReelId: source === "featured" ? input.featuredReelId! : null,
          tiktokVideoId: source === "tiktok" ? input.tiktokVideoId! : null,
          youtubeVideoId: source === "youtube" ? input.youtubeVideoId! : null,
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          topic: storedTopic,
          gradeLevel: input.gradeLevel,
          status: "processing",
        });

        const subGen = await getUserSubscription(ctx.user.id);
        const limitsGen = getPlanLimits(subGen.plan as PlanId);
        const effectiveAddCues = Boolean(input.addCues && limitsGen.hasAiCues);

        const platformLabel =
          source === "tiktok"
            ? "TikTok video" as const
            : source === "youtube"
              ? "YouTube Short" as const
              : "Instagram Reel" as const;
        await dispatchPilotJob({
          jobType: "remake_generation",
          idempotencyKey: `remake_generation:${scriptId}`,
          payload: {
            scriptId,
            userId: ctx.user.id,
            originalTranscript: transcription.transcript,
            segments: transcription.segments,
            caption,
            reel: reelForGeneration,
            topic: promptAngle,
            gradeLevel: input.gradeLevel,
            addCues: effectiveAddCues,
            platformLabel,
          },
          runInline: () =>
            runScriptGeneration(
              scriptId,
              ctx.user.id,
              transcription.transcript,
              transcription.segments,
              caption,
              reelForGeneration,
              promptAngle,
              input.gradeLevel,
              effectiveAddCues,
              platformLabel
            ),
          onInlineError: (error) =>
            console.error(`Script generation ${scriptId} failed:`, error),
        });

        return { scriptId, status: "processing" as const };
      }),

    /** Rewrite an existing script with new grade level, target duration, and delivery cues */
    rewrite: protectedProcedure
      .input(
        z.object({
          scriptId: z.number(),
          gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6", "7", "8"]),
          targetDuration: z.enum(["any", "15", "30", "45", "60", "90"]),
          addCues: z.boolean().default(true),
          angle: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existingScript = await assertRecreatedScriptInWorkspace(input.scriptId, ctx);
        if (!existingScript.generatedScript) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Script has no content to rewrite" });
        }

        // Check usage limit before rewriting
        const usageCheck = await checkUsageLimit(ctx.user.id, "rewriteCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your rewrite limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "rewriteCount");

        const subRw = await getUserSubscription(ctx.user.id);
        const limitsRw = getPlanLimits(subRw.plan as PlanId);
        const effectiveAddCues = Boolean(input.addCues && limitsRw.hasAiCues);

        // Get the original source (user-scrape reel OR featured reel) for
        // caption + transcript context. The new rewrite row inherits whichever
        // id the previous row carried so the "exactly one" invariant holds.
        let reelCaption = "";
        let reelTranscript = "";
        if (existingScript.featuredReelId != null) {
          const fr = await getFeaturedReelById(existingScript.featuredReelId);
          reelCaption = fr?.caption ?? "";
          const t = await getTranscriptionByFeaturedReelId(existingScript.featuredReelId);
          reelTranscript = t?.transcript ?? "";
        } else if (existingScript.reelId != null) {
          const reel = await getReelById(existingScript.reelId);
          reelCaption = reel?.caption ?? "";
          const t = await getTranscriptionByReelId(existingScript.reelId);
          reelTranscript = t?.transcript ?? "";
        }

        const trimmedAngle = input.angle?.trim() ?? "";
        let storedTopic = existingScript.topic || "SAME_TOPIC";
        let promptAngle: string | undefined;
        const hasExplicitUserAngle = trimmedAngle.length > 0;
        if (hasExplicitUserAngle) {
          const aud = (ctx.user.targetAudience ?? "").trim();
          const biz = (ctx.user.businessDescription ?? "").trim();
          promptAngle = buildRecreateTopicPrompt({
            angle: trimmedAngle,
            targetAudience: aud || null,
            businessDescription: biz || null,
          });
          storedTopic = trimmedAngle;
        }

        // Create a new script entry for the rewrite
        const newScriptId = await createRecreatedScript({
          reelId: existingScript.reelId,
          featuredReelId: existingScript.featuredReelId,
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          topic: storedTopic,
          gradeLevel: input.gradeLevel,
          status: "processing",
        });

        // Run rewrite in background
        runScriptRewrite(
          newScriptId,
          existingScript.generatedScript,
          existingScript.viralStructure as Record<string, unknown> | null,
          reelTranscript,
          reelCaption,
          input.gradeLevel,
          input.targetDuration,
          effectiveAddCues,
          promptAngle,
          hasExplicitUserAngle
        ).catch((err: unknown) => {
          console.error(`Script rewrite ${newScriptId} failed:`, err);
        });

        return { scriptId: newScriptId, status: "processing" as const };
      }),

    /** Get status of a specific recreated script */
    status: protectedProcedure
      .input(z.object({ scriptId: z.number() }))
      .query(async ({ ctx, input }) => {
        return assertRecreatedScriptInWorkspace(input.scriptId, ctx);
      }),

    /** List all recreated scripts for a reel (either source). */
    list: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .query(async ({ ctx, input }) => {
        if (input.featuredReelId != null) {
          return getRecreatedScriptsByFeaturedReelId(
            input.featuredReelId,
            ctx.workspaceId
          );
        }
        if (input.tiktokVideoId != null) {
          return getRecreatedScriptsByTiktokVideoId(
            input.tiktokVideoId,
            ctx.workspaceId
          );
        }
        if (input.youtubeVideoId != null) {
          return getRecreatedScriptsByYoutubeVideoId(
            input.youtubeVideoId,
            ctx.workspaceId
          );
        }
        return getRecreatedScriptsByReelId(input.reelId!, ctx.workspaceId);
      }),

    /**
     * Latest recreated script per reel (max row id) for the current user.
     * Dashboard list/grid uses this to show Make My Version / Generating /
     * Open My Script. Missing keys = no row yet. Exactly one of reelIds /
     * featuredReelIds / tiktokVideoIds / youtubeVideoIds must be non-empty.
     */
    checkBatch: protectedProcedure
      .input(
        z
          .object({
            reelIds: z.array(z.number()).optional(),
            featuredReelIds: z.array(z.number()).optional(),
            tiktokVideoIds: z.array(z.number()).optional(),
            youtubeVideoIds: z.array(z.number()).optional(),
          })
          .refine(
            (d) =>
              [
                d.reelIds && d.reelIds.length > 0,
                d.featuredReelIds && d.featuredReelIds.length > 0,
                d.tiktokVideoIds && d.tiktokVideoIds.length > 0,
                d.youtubeVideoIds && d.youtubeVideoIds.length > 0,
              ].filter(Boolean).length === 1,
            {
              message:
                "Provide exactly one of reelIds, featuredReelIds, tiktokVideoIds, or youtubeVideoIds (non-empty)",
            }
          )
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const map: Record<
          number,
          { latestScriptId: number; status: (typeof recreatedScripts.$inferSelect)["status"] }
        > = {};

        const fillBest = (
          rows: Array<{
            sourceId: number | null;
            id: number;
            status: (typeof recreatedScripts.$inferSelect)["status"];
          }>
        ) => {
          const best = new Map<
            number,
            { id: number; status: (typeof recreatedScripts.$inferSelect)["status"] }
          >();
          for (const r of rows) {
            if (r.sourceId == null) continue;
            const cur = best.get(r.sourceId);
            if (!cur || r.id > cur.id) {
              best.set(r.sourceId, { id: r.id, status: r.status });
            }
          }
          for (const [sid, v] of best) {
            map[sid] = { latestScriptId: v.id, status: v.status };
          }
        };

        if (input.featuredReelIds && input.featuredReelIds.length > 0) {
          const rows = await db
            .select({
              sourceId: recreatedScripts.featuredReelId,
              id: recreatedScripts.id,
              status: recreatedScripts.status,
            })
            .from(recreatedScripts)
            .where(
              and(
                eq(recreatedScripts.workspaceId, ctx.workspaceId),
                inArray(
                  recreatedScripts.featuredReelId as any,
                  input.featuredReelIds
                )
              )
            );
          fillBest(rows);
          return map;
        }

        if (input.tiktokVideoIds && input.tiktokVideoIds.length > 0) {
          const rows = await db
            .select({
              sourceId: recreatedScripts.tiktokVideoId,
              id: recreatedScripts.id,
              status: recreatedScripts.status,
            })
            .from(recreatedScripts)
            .where(
              and(
                eq(recreatedScripts.workspaceId, ctx.workspaceId),
                inArray(
                  recreatedScripts.tiktokVideoId as any,
                  input.tiktokVideoIds
                )
              )
            );
          fillBest(rows);
          return map;
        }

        if (input.youtubeVideoIds && input.youtubeVideoIds.length > 0) {
          const rows = await db
            .select({
              sourceId: recreatedScripts.youtubeVideoId,
              id: recreatedScripts.id,
              status: recreatedScripts.status,
            })
            .from(recreatedScripts)
            .where(
              and(
                eq(recreatedScripts.workspaceId, ctx.workspaceId),
                inArray(
                  recreatedScripts.youtubeVideoId as any,
                  input.youtubeVideoIds
                )
              )
            );
          fillBest(rows);
          return map;
        }

        const rows = await db
          .select({
            sourceId: recreatedScripts.reelId,
            id: recreatedScripts.id,
            status: recreatedScripts.status,
          })
          .from(recreatedScripts)
          .where(
            and(
              eq(recreatedScripts.workspaceId, ctx.workspaceId),
              inArray(recreatedScripts.reelId as any, input.reelIds!)
            )
          );
        fillBest(rows);
        return map;
      }),
});
