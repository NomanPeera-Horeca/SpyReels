import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { assertRecreatedScriptInWorkspace } from "../assertRecreatedScriptInWorkspace";
import { assertScriptInWorkspace } from "../assertScriptInWorkspace";
import { upsertBrollGeneration, updateBrollGenerationBeatClips, getBrollGenerationByScriptId, listScriptIdsWithBroll as listBrollScriptIds } from "../broll/db";
import { suggestBrollForScript, regenerateBrollBeat } from "../broll/suggestBroll";
import { ensureDefaultTags, createSavedScript, createScriptVersion, assignTagToScript, getTagsForScript, getScriptVersions, getReelById, getSavedScriptsByWorkspace, getScriptsByTag, getTagsForScripts, updateSavedScript, getLatestVersionNumber, deleteSavedScript, removeTagFromScript } from "../db";
import { ensureSavedScriptFromRecreate } from "../ensureSavedScriptFromRecreate";
import { generateSeoInstagramCaption } from "../generateSeoCaption";
import { createShareLinkForScript, revokeShareLinkForScript, getShareLinkInfoForScript } from "../scriptShareLinks";
import { enrichScriptsWithSendMeta, sendScriptToWorkspace } from "../scriptsSendToWorkspace";
import { toSourceReel } from "../sourceReel";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { and, or, not, like } from "drizzle-orm";

/**
 * Parse a date string safely to avoid timezone shift.
 * When given a date-only string like "2025-03-10", new Date() creates UTC midnight
 * which can shift back a day in local timezone. This helper appends T12:00:00 to
 * date-only strings to keep the date stable across timezones.
 */
function parseDateSafe(dateStr: string): Date {
  // If it's already a full ISO string (has T), parse as-is
  if (dateStr.includes("T")) return new Date(dateStr);
  // Date-only string: append noon to avoid timezone day-shift
  return new Date(dateStr + "T12:00:00");
}

export const scriptsRouter = router({
    /** Save a script to the library */
    save: protectedProcedure
      .input(z.object({
        reelId: z.number().optional(),
        recreatedScriptId: z.number().optional(),
        title: z.string().min(1),
        content: z.string().min(1),
        sourceHandle: z.string().optional(),
        gradeLevel: z.string().optional(),
        postDate: z.string().optional(), // ISO date string
        postTime: z.string().optional(), // HH:MM format
        notes: z.string().optional(),
        tagIds: z.array(z.number()).optional(),
        status: z.enum(["draft", "approved"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
        const wordCount = input.content.trim().split(/\s+/).length;
        const scriptId = await createSavedScript({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          reelId: input.reelId ?? null,
          recreatedScriptId: input.recreatedScriptId ?? null,
          title: input.title,
          content: input.content,
          originalContent: input.content,
          sourceHandle: input.sourceHandle ?? null,
          gradeLevel: input.gradeLevel ?? null,
          wordCount,
          postDate: input.postDate ? parseDateSafe(input.postDate) : null,
          postTime: input.postTime ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "draft",
        });
        // Create initial version
        await createScriptVersion({
          scriptId,
          content: input.content,
          versionNumber: 1,
          changeType: "initial",
          changeDescription: "Initial script saved",
        });
        // Assign tags
        if (input.tagIds && input.tagIds.length > 0) {
          for (const tagId of input.tagIds) {
            await assignTagToScript(scriptId, tagId);
          }
        }
        return { id: scriptId };
      }),

    /**
     * Remake workspace needs a saved_scripts row (scripts.get / update / AI).
     * recreate.generate returns recreated_scripts.id. Promote completed remake
     * into My Scripts (idempotent by recreated id; upsert by reel on re-remake).
     * Also accepts an already-saved script id and returns it unchanged.
     */
    ensureFromRecreate: protectedProcedure
      .input(
        z.object({
          /** recreated_scripts.id from recreate.generate / checkBatch */
          recreatedScriptId: z.number().optional(),
          /** saved_scripts.id if caller already has a library script */
          savedScriptId: z.number().optional(),
        }).refine(
          (d) =>
            (d.recreatedScriptId != null ? 1 : 0) + (d.savedScriptId != null ? 1 : 0) === 1,
          { message: "Provide exactly one of recreatedScriptId or savedScriptId" }
        )
      )
      .mutation(async ({ ctx, input }) => {
        if (input.savedScriptId != null) {
          await assertScriptInWorkspace(input.savedScriptId, ctx);
          return { id: input.savedScriptId, created: false as const, updated: false as const };
        }

        const recreatedScriptId = input.recreatedScriptId!;
        let recreated: Awaited<ReturnType<typeof assertRecreatedScriptInWorkspace>>;
        try {
          recreated = await assertRecreatedScriptInWorkspace(
            recreatedScriptId,
            ctx
          );
        } catch {
          // Caller may already hold a saved_scripts id (post-promote reopen).
          await assertScriptInWorkspace(recreatedScriptId, ctx);
          return { id: recreatedScriptId, created: false as const, updated: false as const };
        }

        return ensureSavedScriptFromRecreate({
          workspaceId: ctx.workspaceId,
          userId: ctx.user.id,
          recreated,
        });
      }),

    /** Get a single script with tags and versions */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const script = await assertScriptInWorkspace(input.id, ctx);
        const tags = await getTagsForScript(input.id);
        const versions = await getScriptVersions(input.id);
        const [enriched] = await enrichScriptsWithSendMeta([script]);
        let sourceReel = null;
        if (script.reelId != null) {
          const reel = await getReelById(script.reelId);
          if (reel) {
            sourceReel = toSourceReel(reel);
          }
        }
        return { ...enriched, tags, versions, sourceReel };
      }),

    /** List all scripts for the user */
    list: protectedProcedure
      .input(z.object({
        tagId: z.number().optional(),
        status: z.enum(["draft", "approved"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
        let scripts: Awaited<ReturnType<typeof getSavedScriptsByWorkspace>>;
        if (input?.tagId) {
          scripts = await getScriptsByTag(ctx.workspaceId, input.tagId);
        } else {
          scripts = await getSavedScriptsByWorkspace(ctx.workspaceId);
        }
        if (input?.status) {
          scripts = scripts.filter(s => s.status === input.status);
        }
        const tagMap = await getTagsForScripts(scripts.map((s) => s.id));
        const result = scripts.map((s) => ({
          ...s,
          tags: tagMap.get(s.id) ?? [],
        }));
        return enrichScriptsWithSendMeta(result);
      }),

    /** Update a script (content, title, postDate, notes, status) */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        postDate: z.string().nullable().optional(),
        postTime: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["draft", "approved"]).optional(),
        gradeLevel: z.string().optional(),
        generatedCaption: z.string().nullable().optional(),
        generatedHashtags: z.string().nullable().optional(),
        captionStyle: z.string().nullable().optional(),
        frame0OnScreenText: z.string().max(120).nullable().optional(),
        changeType: z.enum(["manual_edit", "ai_rewrite", "grammar_fix"]).optional(),
        changeDescription: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.id, ctx);
        const updateData: Parameters<typeof updateSavedScript>[1] = {};
        if (input.title !== undefined) updateData.title = input.title;
        if (input.postDate !== undefined) updateData.postDate = input.postDate ? parseDateSafe(input.postDate) : null;
        if (input.postTime !== undefined) updateData.postTime = input.postTime;
        if (input.notes !== undefined) updateData.notes = input.notes;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.gradeLevel !== undefined) updateData.gradeLevel = input.gradeLevel;
        if (input.generatedCaption !== undefined) updateData.generatedCaption = input.generatedCaption;
        if (input.generatedHashtags !== undefined) updateData.generatedHashtags = input.generatedHashtags;
        if (input.captionStyle !== undefined) updateData.captionStyle = input.captionStyle;
        if (input.frame0OnScreenText !== undefined) {
          const trimmed = input.frame0OnScreenText?.trim() || null;
          updateData.frame0OnScreenText = trimmed ? trimmed.slice(0, 120) : null;
        }
        if (input.content !== undefined) {
          updateData.content = input.content;
          updateData.wordCount = input.content.trim().split(/\s+/).length;
          // Create a new version
          const versionNum = await getLatestVersionNumber(input.id);
          await createScriptVersion({
            scriptId: input.id,
            content: input.content,
            versionNumber: versionNum + 1,
            changeType: input.changeType || "manual_edit",
            changeDescription: input.changeDescription || "Manual edit",
          });
        }
        await updateSavedScript(input.id, updateData);
        return { success: true };
      }),

    /** Delete a script */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.id, ctx);
        await deleteSavedScript(input.id);
        return { success: true };
      }),

    /** Assign/remove tags */
    assignTag: protectedProcedure
      .input(z.object({ scriptId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        await assignTagToScript(input.scriptId, input.tagId);
        return { success: true };
      }),

    removeTag: protectedProcedure
      .input(z.object({ scriptId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        await removeTagFromScript(input.scriptId, input.tagId);
        return { success: true };
      }),

    bulkAssignTag: protectedProcedure
      .input(
        z.object({
          scriptIds: z.array(z.number()).min(1).max(50),
          tagId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const scriptId of input.scriptIds) {
          await assertScriptInWorkspace(scriptId, ctx);
          await assignTagToScript(scriptId, input.tagId);
        }
        return { success: true, count: input.scriptIds.length };
      }),

    bulkRemoveTag: protectedProcedure
      .input(
        z.object({
          scriptIds: z.array(z.number()).min(1).max(50),
          tagId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const scriptId of input.scriptIds) {
          await assertScriptInWorkspace(scriptId, ctx);
          await removeTagFromScript(scriptId, input.tagId);
        }
        return { success: true, count: input.scriptIds.length };
      }),

    /** AI Grammar Check - fix spelling, grammar, sentence structure */
    grammarCheck: protectedProcedure
      .input(
        z.object({
          scriptId: z.number(),
          content: z.string(),
          /** When false, return corrected text without writing My Scripts (Remake Apply flow). */
          persist: z.boolean().optional().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You are a professional editor and grammar checker. Fix spelling mistakes, grammar errors, and improve sentence structure while keeping the original meaning, tone, and style intact. Do NOT change the content or add new ideas. Return ONLY the corrected text, nothing else."
              ),
            },
            { role: "user", content: input.content },
          ],
        });
        const corrected =
          (response.choices[0]?.message?.content as string) || input.content;
        if (input.persist) {
          const wordCount = corrected.trim().split(/\s+/).length;
          const versionNum = await getLatestVersionNumber(input.scriptId);
          await createScriptVersion({
            scriptId: input.scriptId,
            content: corrected,
            versionNumber: versionNum + 1,
            changeType: "grammar_fix",
            changeDescription: "AI grammar and spelling correction",
          });
          await updateSavedScript(input.scriptId, { content: corrected, wordCount });
        }
        return { content: corrected };
      }),

    /** AI Rewrite - rewrite the script with AI while keeping the same structure */
    aiRewrite: protectedProcedure
      .input(
        z.object({
          scriptId: z.number(),
          content: z.string(),
          instruction: z.string().optional(), // optional custom instruction
          /** When false, return rewrite without writing My Scripts (Remake Apply flow). */
          persist: z.boolean().optional().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const userInstruction =
          input.instruction?.trim() ||
          "Rewrite this script to sound more natural and engaging while keeping the same topic and key points. Make it sound like a confident creator speaking to camera.";
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You rewrite short-form spoken video scripts (Instagram Reels, TikTok, YouTube Shorts).

Rules:
- Follow the rewrite request exactly
- Keep the same topic and core points
- Change wording, sentence openings, and rhythm so the result is clearly different from the input
- Never return the original script unchanged or with only tiny edits
- Return ONLY the rewritten script text, no quotes, labels, or preamble`
              ),
            },
            {
              role: "user",
              content: `Rewrite request:\n${userInstruction}\n\nCurrent script:\n${input.content}`,
            },
          ],
        });
        let rewritten =
          (response.choices[0]?.message?.content as string) || input.content;
        rewritten = String(rewritten).trim();
        const originalNorm = input.content.replace(/\s+/g, " ").trim().toLowerCase();
        const rewrittenNorm = rewritten.replace(/\s+/g, " ").trim().toLowerCase();
        if (!rewritten || rewrittenNorm === originalNorm) {
          const retry = await invokeLLM({
            messages: [
              {
                role: "system",
                content: withAiFormattingRules(
                  `You rewrite spoken short-form video scripts. The previous attempt copied the input. This time you MUST produce a clearly different rewrite that still covers the same points. Change at least half of the sentence openings. Return ONLY the new script text.`
                ),
              },
              {
                role: "user",
                content: `Rewrite request:\n${userInstruction}\n\nCurrent script (do not copy):\n${input.content}`,
              },
            ],
          });
          const retried = String(retry.choices[0]?.message?.content ?? "").trim();
          if (retried) rewritten = retried;
        }
        if (input.persist) {
          const wordCount = rewritten.trim().split(/\s+/).length;
          const versionNum = await getLatestVersionNumber(input.scriptId);
          await createScriptVersion({
            scriptId: input.scriptId,
            content: rewritten,
            versionNumber: versionNum + 1,
            changeType: "ai_rewrite",
            changeDescription: input.instruction || "AI rewrite for natural delivery",
          });
          await updateSavedScript(input.scriptId, { content: rewritten, wordCount });
        }
        return { content: rewritten };
      }),

    /** Phrase Swapper - swap key phrases with creative alternatives */
    phraseSwap: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You are a creative copywriter for short-form video scripts. Your job is to swap key phrases, power words, and expressions with fresh, punchy alternatives that sound more engaging and viral. Keep the same meaning, structure, and flow. Swap at least 5-8 phrases throughout the script. Do NOT add new sentences or change the topic. Return ONLY the updated script text, nothing else."
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const swapped = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = swapped.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: swapped,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: "AI phrase swap - refreshed key phrases",
        });
        await updateSavedScript(input.scriptId, { content: swapped, wordCount });
        return { content: swapped };
      }),

    /** Simplifier - make script more conversational and easy to understand */
    simplify: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You are a script simplifier for short-form video content. Rewrite this script using simpler, everyday language that anyone can understand. Use short sentences. Replace jargon with plain words. Make it sound like you're talking to a friend. Keep the same structure, key points, and hook. Return ONLY the simplified script text, nothing else."
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const simplified = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = simplified.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: simplified,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: "AI simplification - made more conversational",
        });
        await updateSavedScript(input.scriptId, { content: simplified, wordCount });
        return { content: simplified };
      }),

    /** Grade Level - rewrite at a specific tone/level */
    adjustTone: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        tone: z.enum(["casual", "professional", "academic", "gen_z", "storyteller"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const tonePrompts: Record<string, string> = {
          casual: "Rewrite in a super casual, friendly tone, like texting a buddy. Use contractions, slang, and keep it real. Short punchy sentences.",
          professional: "Rewrite in a polished, professional tone suitable for a business audience. Clear, confident, and authoritative. No slang.",
          academic: "Rewrite in an educational, informative tone. Use precise language, cite-worthy phrasing, and structured arguments. Sound like a TED talk.",
          gen_z: "Rewrite in Gen Z internet speak. Use trending phrases, be relatable, add energy. Think TikTok creator vibes. Keep it short and punchy with attitude.",
          storyteller: "Rewrite as a compelling story. Add narrative hooks, build tension, use vivid descriptions. Make the viewer feel like they're watching a mini-movie.",
        };
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a script tone adjuster for short-form video content. ${tonePrompts[input.tone]} Keep the same key points and structure. Return ONLY the rewritten script text, nothing else.`
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const adjusted = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = adjusted.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: adjusted,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Tone adjusted to ${input.tone}`,
        });
        await updateSavedScript(input.scriptId, { content: adjusted, wordCount });
        return { content: adjusted };
      }),

    /** Make Shorter - condense script to fit a target duration */
    makeShorter: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        targetSeconds: z.number().min(15).max(120),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        // Average speaking rate: ~3 words per second
        const targetWords = Math.round(input.targetSeconds * 3);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a script editor specializing in short-form video content. Condense this script to approximately ${targetWords} words (about ${input.targetSeconds} seconds when spoken). Keep the hook, the core message, and the call-to-action. Cut filler, redundant points, and unnecessary details. Make every word count. Return ONLY the shortened script text, nothing else.`
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const shortened = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = shortened.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: shortened,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Shortened to ~${input.targetSeconds}s (${targetWords} words target)`,
        });
        await updateSavedScript(input.scriptId, { content: shortened, wordCount });
        return { content: shortened };
      }),

    /** Rewrite Selected Lines - rewrite only the highlighted portion */
    rewriteSelection: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        fullContent: z.string(),
        selectedText: z.string(),
        instruction: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const instruction = input.instruction || "Make it more engaging and punchy";
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a script editor for short-form video content. The user has selected a specific portion of their script to rewrite. Rewrite ONLY the selected text according to the instruction: "${instruction}". Keep the same approximate length. Return ONLY the rewritten selected text, nothing else. Do NOT return the full script.`
              ),
            },
            {
              role: "user",
              content: `Full script for context:\n---\n${input.fullContent}\n---\n\nSelected text to rewrite:\n"${input.selectedText}"`
            }
          ],
        });
        const rewrittenSelection = (response.choices[0]?.message?.content as string) || input.selectedText;
        // Replace the selected text in the full content
        const newContent = input.fullContent.replace(input.selectedText, rewrittenSelection);
        const wordCount = newContent.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: newContent,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Rewrite selection: "${instruction}"`,
        });
        await updateSavedScript(input.scriptId, { content: newContent, wordCount });
        return { content: newContent, rewrittenPart: rewrittenSelection };
      }),

    /** Rewrite with Angle - rewrite the entire script with a specific angle/idea */
    rewriteWithAngle: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        angle: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a creative script writer for short-form video content. Rewrite this script with a completely new angle/perspective: "${input.angle}". Keep the same core topic but approach it from this new angle. Maintain a similar length and the hook-body-CTA structure. Make it feel fresh and original. Return ONLY the rewritten script text, nothing else.`
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const rewritten = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = rewritten.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: rewritten,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Rewritten with angle: "${input.angle}"`,
        });
        await updateSavedScript(input.scriptId, { content: rewritten, wordCount });
        return { content: rewritten };
      }),

    /** Generate an SEO-optimized Instagram caption with 5 strategic hashtags */
    generateCaption: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string().min(1),
        style: z.enum(["storytelling", "question", "cta", "educational", "curiosity", "bold", "relatable"]).default("educational"),
        captionLength: z.enum(["auto", "short", "medium", "long"]).default("auto"),
        niche: z.string().optional(),
        brandHashtag: z.string().optional(),
        targetAudience: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);

        let result;
        try {
          result = await generateSeoInstagramCaption({
            content: input.content,
            style: input.style,
            captionLength: input.captionLength,
            niche: input.niche,
            brandHashtag: input.brandHashtag,
            targetAudience: input.targetAudience,
          });
        } catch (err) {
          console.error(`[scripts.generateCaption] failed for script ${input.scriptId}:`, err);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Caption generation failed",
          });
        }

        await updateSavedScript(input.scriptId, {
          generatedCaption: result.caption,
          generatedHashtags: JSON.stringify(result.hashtags),
          captionStyle: result.style,
        } as any);

        return {
          caption: result.caption,
          hashtags: result.hashtags,
          primaryKeyword: result.primaryKeyword,
          hookType: result.hookType,
          style: result.style,
        };
      }),

    /** Get version history for a script */
    versions: protectedProcedure
      .input(z.object({ scriptId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        return getScriptVersions(input.scriptId);
      }),

    /** Restore a specific version */
    restoreVersion: protectedProcedure
      .input(z.object({ scriptId: z.number(), versionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const versions = await getScriptVersions(input.scriptId);
        const version = versions.find(v => v.id === input.versionId);
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
        const wordCount = version.content.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: version.content,
          versionNumber: versionNum + 1,
          changeType: "manual_edit",
          changeDescription: `Restored from version ${version.versionNumber}`,
        });
        await updateSavedScript(input.scriptId, { content: version.content, wordCount });
        return { content: version.content };
      }),

    /** Copy a script into another workspace the user belongs to */
    sendToWorkspace: protectedProcedure
      .input(
        z.object({
          scriptId: z.number().int().positive(),
          targetWorkspaceId: z.string().uuid(),
          note: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return sendScriptToWorkspace(ctx, input);
      }),

    createShareLink: protectedProcedure
      .input(z.object({ scriptId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return createShareLinkForScript(ctx, input.scriptId);
      }),

    revokeShareLink: protectedProcedure
      .input(z.object({ scriptId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return revokeShareLinkForScript(ctx, input.scriptId);
      }),

    getShareLinkInfo: protectedProcedure
      .input(z.object({ scriptId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return getShareLinkInfoForScript(ctx, input.scriptId);
      }),

    /**
     * Suggest Pexels B-roll clips for a script.
     * One LLM beat-split call, then one Pexels video search per beat with in-job URL dedupe.
     * Gated by brollGenerationCount (generation runs only, not clip downloads).
     * When scriptId is present, upserts the result into broll_generations.
     */
    suggestBroll: protectedProcedure
      .input(
        z.object({
          content: z.string().min(1).max(12000),
          scriptId: z.number().int().positive().optional(),
          niche: z.string().max(120).optional(),
          clipsPerBeat: z.number().int().min(1).max(3).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.scriptId != null) {
          await assertScriptInWorkspace(input.scriptId, ctx);
        }

        const usageCheck = await checkUsageLimit(
          ctx.user.id,
          "brollGenerationCount",
          ctx.user.openId,
          { email: ctx.user.email, role: ctx.user.role }
        );
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your monthly B-roll generation limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        const result = await suggestBrollForScript({
          content: input.content,
          niche: input.niche,
          clipsPerBeat: input.clipsPerBeat,
        });

        // Persist for library / ScriptEditor flows that have a saved script.
        // Paste-only (no scriptId) skips persist; result still returned.
        if (input.scriptId != null) {
          await upsertBrollGeneration({
            userId: ctx.user.id,
            workspaceId: ctx.workspaceId,
            scriptId: input.scriptId,
            result,
          });
        }

        // Count successful generation runs only (not per-clip downloads).
        await incrementUsage(ctx.user.id, "brollGenerationCount");
        return result;
      }),

    /**
     * Re-search Pexels for a single beat (no LLM split, no full suggestBroll).
     * Product decision: does NOT increment brollGenerationCount (cheaper op;
     * currently unlimited per-beat re-search; can add a light limit later).
     * When scriptId + beatIndex are set, patches that beat's clips in broll_generations.
     */
    regenerateBrollBeat: protectedProcedure
      .input(
        z.object({
          searchQuery: z.string().min(1).max(240),
          visualSummary: z.string().max(500).optional(),
          niche: z.string().max(120).optional(),
          theme: z.string().max(240).optional(),
          excludeUrls: z.array(z.string().max(2048)).max(40).optional(),
          clipsPerBeat: z.number().int().min(1).max(3).optional(),
          userContext: z.string().max(120).optional(),
          scriptId: z.number().int().positive().optional(),
          beatIndex: z.number().int().min(0).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.scriptId != null) {
          await assertScriptInWorkspace(input.scriptId, ctx);
        }

        // Intentionally no checkUsageLimit / incrementUsage for brollGenerationCount.
        const result = await regenerateBrollBeat({
          searchQuery: input.searchQuery,
          visualSummary: input.visualSummary,
          niche: input.niche,
          theme: input.theme,
          excludeUrls: input.excludeUrls,
          clipsPerBeat: input.clipsPerBeat,
          userContext: input.userContext,
        });

        if (
          input.scriptId != null &&
          input.beatIndex != null
        ) {
          await updateBrollGenerationBeatClips({
            scriptId: input.scriptId,
            workspaceId: ctx.workspaceId,
            beatIndex: input.beatIndex,
            clips: result.clips,
          });
        }

        return result;
      }),

    /**
     * Load persisted B-roll for a saved script (no usage increment).
     * Returns null when no generation has been saved yet.
     */
    getBrollGeneration: protectedProcedure
      .input(z.object({ scriptId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const row = await getBrollGenerationByScriptId(
          input.scriptId,
          ctx.workspaceId
        );
        if (!row) return null;
        return {
          scriptId: row.scriptId,
          result: row.beatsJson,
          updatedAt: row.updatedAt,
        };
      }),

    /**
     * Lightweight list of scriptIds in the workspace that have saved B-roll.
     */
    listScriptIdsWithBroll: protectedProcedure.query(async ({ ctx }) => {
      return listBrollScriptIds(ctx.workspaceId);
    }),
});
