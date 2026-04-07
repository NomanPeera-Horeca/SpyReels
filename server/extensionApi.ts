/**
 * REST API endpoints for the Chrome Extension.
 * These are separate from tRPC because the extension needs simple REST calls.
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  getSubscription,
  getExtensionUsage,
  incrementExtensionUsage,
  createExtensionToken,
  getExtensionTokenUser,
  getUserByOpenId,
  createScrapeJob,
  insertReels,
  createTranscription,
  updateTranscription,
  getReelsByJobId,
  getReelById,
  createSavedScript,
} from "./db";
import { fetchReelByShortcode, fetchProfile, searchReelsByHandle } from "./instagram";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";

const FREE_TRANSCRIBE_LIMIT = 3;

export function createExtensionRouter(): Router {
  const router = Router();

  // Middleware: authenticate extension requests via bearer token OR session cookie
  async function authenticateExtension(req: Request, res: Response, next: Function) {
    // Try bearer token first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const tokenRecord = await getExtensionTokenUser(token);
        if (tokenRecord) {
          (req as any).userId = tokenRecord.userId;
          return next();
        }
      } catch (err) {
        // Fall through to session auth
      }
    }

    // Try session cookie auth (same as web app)
    try {
      const user = await sdk.authenticateRequest(req);
      if (user) {
        (req as any).userId = user.id;
        (req as any).user = user;
        return next();
      }
    } catch (err) {
      // Not authenticated
    }

    return res.status(401).json({ error: "Authentication required. Please log in to the dashboard first.", code: "AUTH_REQUIRED" });
  }

  // ── Generate Extension Token ──
  // Called from the web app when user clicks "Connect Extension"
  router.post("/generate-token", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const token = `rdx_${crypto.randomBytes(32).toString("hex")}`;
      await createExtensionToken(userId, token);
      return res.json({ token });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Check Subscription Status ──
  router.get("/subscription", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const sub = await getSubscription(userId);
      const today = new Date().toISOString().slice(0, 10);
      const usage = await getExtensionUsage(userId, today);

      const isPro = sub?.plan === "pro" && sub?.status === "active";
      const transcribesUsed = usage?.transcribeCount || 0;
      const transcribesRemaining = isPro ? 999 : Math.max(0, FREE_TRANSCRIBE_LIMIT - transcribesUsed);

      return res.json({
        plan: isPro ? "pro" : "free",
        status: sub?.status || "active",
        transcribesUsed,
        transcribesRemaining,
        canTranscribe: isPro || transcribesUsed < FREE_TRANSCRIBE_LIMIT,
        canRemake: isPro,
        currentPeriodEnd: sub?.currentPeriodEnd || null,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Transcribe a Reel ──
  router.post("/transcribe", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { videoUrl, shortcode, caption } = req.body;

      if (!videoUrl || !shortcode) {
        return res.status(400).json({ error: "videoUrl and shortcode are required" });
      }

      // Check usage limits
      const sub = await getSubscription(userId);
      const isPro = sub?.plan === "pro" && sub?.status === "active";
      const today = new Date().toISOString().slice(0, 10);
      const usage = await getExtensionUsage(userId, today);
      const transcribesUsed = usage?.transcribeCount || 0;

      if (!isPro && transcribesUsed >= FREE_TRANSCRIBE_LIMIT) {
        return res.status(403).json({
          error: "Daily transcription limit reached",
          code: "LIMIT_REACHED",
          transcribesUsed,
          limit: FREE_TRANSCRIBE_LIMIT,
          upgradeRequired: true,
        });
      }

      // Download and transcribe
      const { gotScraping } = await import("got-scraping");
      const videoResponse = await gotScraping({ url: videoUrl, responseType: "buffer" });
      const videoBuffer = videoResponse.body as Buffer;

      // Upload to S3 for transcription
      const fileKey = `ext-transcribe/${shortcode}-${Date.now()}.mp4`;
      const { url: s3Url } = await storagePut(fileKey, videoBuffer, "audio/mp4");

      // Transcribe
      const result = await transcribeAudio({ audioUrl: s3Url, language: "en" }) as any;

      // Increment usage
      await incrementExtensionUsage(userId, today, "transcribeCount");

      return res.json({
        transcript: result.text,
        segments: result.segments || [],
        language: result.language || "en",
        transcribesRemaining: isPro ? 999 : Math.max(0, FREE_TRANSCRIBE_LIMIT - transcribesUsed - 1),
      });
    } catch (err: any) {
      console.error("[Extension] Transcribe error:", err.message);
      return res.status(500).json({ error: "Transcription failed: " + err.message });
    }
  });

  // ── Save Reel to Dashboard ──
  router.post("/save-reel", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { shortcode, caption, viewCount, likeCount, commentCount, thumbnailUrl, videoUrl, reelUrl, duration, postedAt, ownerUsername } = req.body;

      if (!shortcode || !reelUrl) {
        return res.status(400).json({ error: "shortcode and reelUrl are required" });
      }

      // Create a scrape job for this extension save
      const jobId = await createScrapeJob({
        userId,
        handle: ownerUsername || "extension-save",
        timeframeDays: 0,
        status: "completed",
      });

      // Insert the reel
      await insertReels([{
        jobId,
        shortcode,
        caption: caption || "",
        viewCount: viewCount || 0,
        likeCount: likeCount || 0,
        commentCount: commentCount || 0,
        thumbnailUrl: thumbnailUrl || "",
        videoUrl: videoUrl || "",
        reelUrl,
        duration: duration || 0,
        postedAt: postedAt ? new Date(postedAt) : new Date(),
        ownerUsername: ownerUsername || "",
      }]);

      // Increment usage
      const today = new Date().toISOString().slice(0, 10);
      await incrementExtensionUsage(userId, today, "saveCount");

      return res.json({ success: true, jobId });
    } catch (err: any) {
      console.error("[Extension] Save reel error:", err.message);
      return res.status(500).json({ error: "Failed to save reel: " + err.message });
    }
  });

  // ── AI Remake (Paid Feature) ──
  router.post("/ai-remake", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { transcript, caption, topic, gradeLevel } = req.body;

      if (!transcript) {
        return res.status(400).json({ error: "transcript is required" });
      }

      // Check subscription
      const sub = await getSubscription(userId);
      const isPro = sub?.plan === "pro" && sub?.status === "active";

      if (!isPro) {
        return res.status(403).json({
          error: "AI Remake requires a Pro subscription",
          code: "UPGRADE_REQUIRED",
          upgradeRequired: true,
        });
      }

      // Step 1: Analyze viral structure
      const structureResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a viral content analyst. Analyze the transcript of a viral Instagram Reel and identify its structure. Return JSON with: hook (type, text, technique), body (pacing, structure, keyPoints), transition (type, text), cta (type, text), overallTone, estimatedPace.`,
          },
          {
            role: "user",
            content: `Analyze this viral reel transcript:\n\n${transcript}\n\nCaption: ${caption || "N/A"}`,
          },
        ],
        response_format: { type: "json_object" as any },
      });

      const viralStructure = JSON.parse(structureResponse.choices[0].message.content as string);

      // Step 2: Generate new script
      const grade = gradeLevel || "auto";
      const topicText = topic || "the same topic";
      const scriptResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a viral script writer. Create a new script based on the viral structure provided. Write at a ${grade === "auto" ? "conversational" : `Grade ${grade}`} reading level. Keep the same hook style, pacing, and CTA pattern but write completely new content about: ${topicText}. Return ONLY the script text, no formatting or labels.`,
          },
          {
            role: "user",
            content: `Original viral structure:\n${JSON.stringify(viralStructure, null, 2)}\n\nOriginal transcript:\n${transcript}\n\nWrite a new script following this exact structure but about: ${topicText}`,
          },
        ],
      });

      const generatedScript = scriptResponse.choices[0].message.content as string;

      // Increment usage
      const today = new Date().toISOString().slice(0, 10);
      await incrementExtensionUsage(userId, today, "remakeCount");

      return res.json({
        viralStructure,
        generatedScript,
        wordCount: generatedScript.split(/\s+/).length,
      });
    } catch (err: any) {
      console.error("[Extension] AI Remake error:", err.message);
      return res.status(500).json({ error: "AI Remake failed: " + err.message });
    }
  });

  // ── Ping / Connection Check ──
  router.get("/ping", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      return res.json({ ok: true, user: user?.name || user?.email || "Connected" });
    } catch {
      return res.json({ ok: true, user: null });
    }
  });

  // ── Sort Feed (fetch and sort a creator's reels) ──
  router.post("/sort-feed", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const { handle, sortBy, limit, filterType } = req.body;
      if (!handle) {
        return res.status(400).json({ error: "handle is required" });
      }

      const result = await searchReelsByHandle(handle, limit || 50);
      const followerCount = result.profile?.followerCount || 0;

      let reels = result.reels.map((r: any) => ({
        shortcode: r.shortcode,
        caption: r.caption || "",
        views: r.viewCount || 0,
        likes: r.likeCount || 0,
        comments: r.commentCount || 0,
        duration: r.duration || 0,
        thumbnail: r.thumbnailUrl || "",
        url: r.reelUrl || `https://www.instagram.com/reel/${r.shortcode}/`,
        postedAt: r.postedAt,
        engagementRate: followerCount > 0
          ? ((r.likeCount + r.commentCount) / followerCount * 100).toFixed(2) + "%"
          : "—",
        engagementValue: followerCount > 0
          ? (r.likeCount + r.commentCount) / followerCount
          : 0,
      }));

      // Sort based on criteria
      switch (sortBy) {
        case "likes":
          reels.sort((a: any, b: any) => b.likes - a.likes);
          break;
        case "views":
          reels.sort((a: any, b: any) => b.views - a.views);
          break;
        case "comments":
          reels.sort((a: any, b: any) => b.comments - a.comments);
          break;
        case "engagement":
          reels.sort((a: any, b: any) => b.engagementValue - a.engagementValue);
          break;
        case "oldest":
          reels.sort((a: any, b: any) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
          break;
        default:
          reels.sort((a: any, b: any) => b.views - a.views);
      }

      return res.json({
        reels: reels.slice(0, limit || 50),
        profile: result.profile,
        total: reels.length,
      });
    } catch (err: any) {
      console.error("[Extension] Sort feed error:", err.message);
      return res.status(500).json({ error: "Failed to sort feed: " + err.message });
    }
  });

  // ── Re-Create Script (uses same LLM as dashboard) ──
  router.post("/recreate", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { transcript, caption, gradeLevel, targetDuration, addCues, shortcode } = req.body;

      if (!transcript) {
        return res.status(400).json({ error: "transcript is required" });
      }

      // Check usage limits
      const sub = await getSubscription(userId);
      const isPro = sub?.plan === "pro" && sub?.status === "active";
      const today = new Date().toISOString().slice(0, 10);
      const usage = await getExtensionUsage(userId, today);
      const transcribesUsed = usage?.transcribeCount || 0;

      if (!isPro && transcribesUsed >= FREE_TRANSCRIBE_LIMIT) {
        return res.status(403).json({
          error: "Free limit reached. Upgrade for unlimited re-creates.",
          code: "LIMIT_REACHED",
          upgradeRequired: true,
        });
      }

      const grade = gradeLevel === "auto" ? "conversational" : `Grade ${gradeLevel}`;
      const durationInstruction = targetDuration && targetDuration !== "any"
        ? `Target duration: ${targetDuration} seconds.`
        : "";
      const cueInstruction = addCues
        ? "Add delivery cues in [brackets] like [pause], [lean in], [emphasize], [slow down], [speed up]."
        : "Do NOT add delivery cues.";

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a viral script writer. Re-create the following transcript as a new script. Write at a ${grade} reading level. ${durationInstruction} ${cueInstruction} Keep the same hook style, pacing, and CTA pattern. Return ONLY the script text.`,
          },
          {
            role: "user",
            content: `Original transcript:\n${transcript}\n\nCaption: ${caption || "N/A"}\n\nRe-create this as a new script.`,
          },
        ],
      });

      const script = response.choices[0].message.content as string;

      // Increment usage
      await incrementExtensionUsage(userId, today, "remakeCount");

      return res.json({
        script,
        wordCount: script.split(/\s+/).length,
      });
    } catch (err: any) {
      console.error("[Extension] Recreate error:", err.message);
      return res.status(500).json({ error: "Re-creation failed: " + err.message });
    }
  });

  // ── Save Script to Calendar ──
  router.post("/save-script", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { title, content, sourceHandle, postDate, postTime, status, gradeLevel } = req.body;

      if (!content) {
        return res.status(400).json({ error: "content is required" });
      }

      const wordCount = content.split(/\s+/).length;
      const scriptId = await createSavedScript({
        userId,
        title: title || "Extension Script",
        content,
        wordCount,
        sourceHandle: sourceHandle || "",
        postDate: postDate ? new Date(postDate) : null,
        postTime: postTime || "09:00",
        status: status || "draft",
        gradeLevel: gradeLevel || "auto",
        notes: "Created from Chrome Extension",
      });

      return res.json({ success: true, scriptId });
    } catch (err: any) {
      console.error("[Extension] Save script error:", err.message);
      return res.status(500).json({ error: "Failed to save script: " + err.message });
    }
  });

  // ── Fetch Reel Data (for sorting) ──
  router.post("/fetch-profile-reels", authenticateExtension as any, async (req: Request, res: Response) => {
    try {
      const { handle, maxReels } = req.body;
      if (!handle) {
        return res.status(400).json({ error: "handle is required" });
      }

      const result = await searchReelsByHandle(handle, maxReels || 50);
      return res.json({
        reels: result.reels.map((r) => ({
          ...r,
          engagementRate: result.profile?.followerCount
            ? ((r.likeCount + r.commentCount) / result.profile.followerCount * 100).toFixed(2)
            : "0",
        })),
        profile: result.profile,
      });
    } catch (err: any) {
      console.error("[Extension] Fetch profile reels error:", err.message);
      return res.status(500).json({ error: "Failed to fetch reels: " + err.message });
    }
  });

  return router;
}
