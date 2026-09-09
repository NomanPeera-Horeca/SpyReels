import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import type { Reel } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { accountEngagementRatePercent } from "../accountEngagementRate";
import { searchReelsByKeyword, searchReelsByHandle, fetchReelByShortcode, resolveInstagramIdentity } from "../instagram";
import { ensureProfilePicOnR2 } from "../profilePicR2";
import { isDurableReelVideoUrl } from "../reelVideoR2";
import { withSearchReelThumbnailMirroring } from "./_shared";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { acquireTranscriptionSlot, releaseTranscriptionSlot } from "../transcriptionSemaphore";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";
import { normalizeInstagramHandle } from "@shared/instagramHandle";
import { not, and, or } from "drizzle-orm";



export const searchRouter = router({
    /** Search reels by keyword using Instagram's tag/keyword search API (matches Instagram explore results) */
    byKeyword: protectedProcedure
      .input(z.object({
        keyword: z.string().min(1).max(256),
        maxResults: z.number().min(1).max(100).optional().default(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "searchCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your search limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "searchCount");
        try {
          // Use Instagram's actual tag sections API to search reels by keyword
          // This matches what Instagram's explore page shows for the same keyword
          const reels = await searchReelsByKeyword(input.keyword, input.maxResults);
          const withStableThumbs = await withSearchReelThumbnailMirroring(reels);

          return {
            reels: withStableThumbs,
            searchType: "keyword" as const,
            query: input.keyword,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Search failed";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    /** Search reels by handle (fetch creator's reels) */
    byHandle: protectedProcedure
      .input(z.object({
        handle: z.string().min(1).max(128),
        maxResults: z.number().min(1).max(100).optional().default(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "searchCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your search limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "searchCount");
        try {
          const { reels, profile } = await searchReelsByHandle(input.handle, input.maxResults);
          const withStableThumbs = await withSearchReelThumbnailMirroring(reels);
          return {
            reels: withStableThumbs,
            searchType: "handle" as const,
            query: input.handle,
            profile,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Search failed";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    /** Transcribe a search result reel (not saved in DB yet) */
    transcribe: protectedProcedure
      .input(z.object({
        shortcode: z.string().min(1),
        videoUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const transcribeCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
        if (!transcribeCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly transcription limit (${transcribeCheck.used}/${transcribeCheck.limit}). Upgrade to ${transcribeCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "transcribeCount");
        await acquireTranscriptionSlot();
        try {
        // Prefer a fresh Instagram URL; fall back to durable R2 when vendor refresh fails.
        const freshData = await fetchReelByShortcode(input.shortcode);
        let videoUrl = freshData?.videoUrl ?? null;
        if (!videoUrl && isDurableReelVideoUrl(input.videoUrl)) {
          console.warn(
            `[search.transcribe] fresh URL unavailable for ${input.shortcode}; falling back to durable stored videoUrl`
          );
          videoUrl = input.videoUrl!.trim();
        }
        if (!videoUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve video URL for this reel.",
          });
        }

        // Call the new Deepgram-based transcription pipeline
        // This handles: download + retry + ffmpeg + Deepgram Nova-3 + classify
        const { transcribeReel } = await import("../services/transcribeReel.js");
        const result = await transcribeReel({
          videoUrl,
          shortcode: input.shortcode,
        });

        if (!result.success) {
          // No-speech is a valid outcome (music/visual-only reel), not an error.
          // Return empty transcript/segments so the existing frontend fallback
          // ("No speech detected") renders cleanly.
          if (result.errorCode === "NO_SPEECH_DETECTED") {
            return {
              transcript: "",
              segments: [],
            };
          }
          // Map remaining error codes to appropriate TRPC error codes
          const code = result.errorCode === "REEL_TOO_LONG" ? "BAD_REQUEST"
            : result.errorCode === "VIDEO_TOO_LARGE" ? "BAD_REQUEST"
            : result.errorCode === "DEEPGRAM_RATE_LIMIT" ? "TOO_MANY_REQUESTS"
            : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({
            code,
            message: result.userMessage,
            cause: { errorCode: result.errorCode },
          });
        }

        return {
          transcript: result.transcript,
          segments: result.segments,
        };
        } finally {
          releaseTranscriptionSlot();
        }
      }),

    /** Re-create a script from a search result reel transcript */
    recreate: protectedProcedure
      .input(z.object({
        transcript: z.string().min(1),
        caption: z.string().optional().default(""),
        topic: z.string().max(2000).optional().default(""),
        gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const recreateCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        if (!recreateCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly AI re-creation limit (${recreateCheck.used}/${recreateCheck.limit}). Upgrade to ${recreateCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "recreateCount");
        const effectiveTopic = input.topic.trim() || "SAME_TOPIC";

        // Use the same LLM pipeline as the main recreate feature
        // Step 1: Analyze viral structure
        const structureResponse = await invokeLLM({
          messages: [
            { role: "system", content: withAiFormattingRules("You are a viral content structure analyst. Always respond with valid JSON only.") },
            { role: "user", content: `Analyze the following viral Reel transcript and identify its exact structure. Return JSON with: hook (type, text, technique), body (pacing, structure, keyPoints), transition (type, text), cta (type, text), overallTone, estimatedPace.\n\nCaption: ${input.caption}\n\nTranscript:\n${input.transcript}` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "viral_structure",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  hook: { type: "object", properties: { type: { type: "string" }, text: { type: "string" }, technique: { type: "string" } }, required: ["type", "text", "technique"], additionalProperties: false },
                  body: { type: "object", properties: { pacing: { type: "string" }, structure: { type: "string" }, keyPoints: { type: "array", items: { type: "string" } } }, required: ["pacing", "structure", "keyPoints"], additionalProperties: false },
                  transition: { type: "object", properties: { type: { type: "string" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
                  cta: { type: "object", properties: { type: { type: "string" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
                  overallTone: { type: "string" },
                  estimatedPace: { type: "string" },
                },
                required: ["hook", "body", "transition", "cta", "overallTone", "estimatedPace"],
                additionalProperties: false,
              },
            },
          },
        });

        let viralStructure: Record<string, any>;
        try {
          viralStructure = sanitizeAiOutputDeep(
            JSON.parse((String(structureResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
          );
        } catch {
          viralStructure = { error: "Failed to parse" };
        }

        const gradeLevelInstruction = input.gradeLevel === "auto"
          ? "Choose the most appropriate grade level."
          : `Write at a Grade ${input.gradeLevel} reading level.`;

        const isSameTopic = effectiveTopic === "SAME_TOPIC";
        const scriptPrompt = isSameTopic
          ? `Rewrite this viral Reel script keeping the SAME TOPIC but make it fresh and original.\n\nStructure: ${JSON.stringify(viralStructure)}\n\nOriginal: ${input.transcript}\n\n${gradeLevelInstruction}\n\nWrite as spoken text, short paragraphs for pauses. No labels.`
          : `Using this viral structure, write a NEW script on: ${effectiveTopic}\n\nStructure: ${JSON.stringify(viralStructure)}\n\nOriginal style reference: ${input.transcript}\n\n${gradeLevelInstruction}\n\nWrite as spoken text, short paragraphs for pauses. No labels.`;

        const scriptResponse = await invokeLLM({
          messages: [
            { role: "system", content: withAiFormattingRules("You are an expert Instagram Reels scriptwriter.") },
            { role: "user", content: scriptPrompt },
          ],
        });

        const generatedScript = String(scriptResponse.choices[0].message.content || "");

        return {
          viralStructure,
          generatedScript,
        };
      }),

    /** Fetch reels by direct Instagram URLs (up to 20) */
    byUrl: protectedProcedure
      .input(z.object({
        urls: z.array(z.string().url()).min(1).max(20),
      }))
      .mutation(async ({ input }) => {
        const results: any[] = [];
        const errors: string[] = [];

        for (const rawUrl of input.urls) {
          try {
            // Parse shortcode from URL
            // Supports: /reel/SHORTCODE/, /p/SHORTCODE/, /reels/SHORTCODE/
            const urlObj = new URL(rawUrl);
            const pathParts = urlObj.pathname.split("/").filter(Boolean);
            let shortcode = "";

            // Find the shortcode after /reel/, /p/, or /reels/
            for (let i = 0; i < pathParts.length; i++) {
              if (["reel", "reels", "p"].includes(pathParts[i]) && pathParts[i + 1]) {
                shortcode = pathParts[i + 1];
                break;
              }
            }

            if (!shortcode) {
              errors.push(`Could not parse shortcode from: ${rawUrl}`);
              continue;
            }

            // Fetch reel data using the media info endpoint (returns full metadata)
            const reelData = await fetchReelByShortcode(shortcode);
            if (!reelData) {
              errors.push(`Could not fetch reel data for: ${rawUrl}`);
              continue;
            }

            // Calculate engagement rate (same formula as reels list + CSV exports)
            results.push({
              shortcode,
              caption: reelData.caption || "",
              viewCount: reelData.viewCount,
              likeCount: reelData.likeCount,
              commentCount: reelData.commentCount,
              thumbnailUrl: reelData.thumbnailUrl || "",
              videoUrl: reelData.videoUrl || "",
              reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
              duration: reelData.duration,
              postedAt: reelData.postedAt.toISOString(),
              ownerUsername: reelData.ownerUsername,
              ownerFullName: reelData.ownerFullName,
              ownerProfilePicUrl: reelData.ownerProfilePicUrl,
              ownerFollowerCount: reelData.ownerFollowerCount,
              engagementRate: accountEngagementRatePercent(
                reelData.likeCount,
                reelData.commentCount,
                reelData.ownerFollowerCount
              ),
            });

            // Small delay between requests to avoid rate limiting
            if (input.urls.indexOf(rawUrl) < input.urls.length - 1) {
              await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            }
          } catch (err) {
            errors.push(`Failed to fetch: ${rawUrl} - ${err instanceof Error ? err.message : "unknown error"}`);
          }
        }

        return {
          reels: await withSearchReelThumbnailMirroring(results),
          errors,
          searchType: "url" as const,
          totalRequested: input.urls.length,
          totalFetched: results.length,
        };
      }),

    /** Profile preview for handle search (same as scrape.profilePreview) */
    profilePreview: protectedProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ input }) => {
        try {
          const profile = await resolveInstagramIdentity(input.handle);
          const cleanHandle = normalizeInstagramHandle(profile.username);
          const proxiedPicUrl = await ensureProfilePicOnR2(
            cleanHandle,
            profile.profilePicUrl
          );
          return {
            found: true as const,
            username: profile.username,
            fullName: profile.fullName,
            biography: profile.biography,
            profilePicUrl: proxiedPicUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            postCount: profile.postCount,
            isVerified: profile.isVerified,
            isPrivate: profile.isPrivate,
            category: profile.category,
            externalUrl: profile.externalUrl,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          return { found: false as const, error: message };
        }
      }),
});
