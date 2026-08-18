import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  type ScriptPack,
  type ScriptPackAudioPick,
  type ScriptPackBeat,
} from "@shared/scriptGeneratorLanding";
import { coachScripts } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import {
  createSavedScript,
  ensureDefaultTags,
  getDb,
  markOnboardingComplete,
  updateUserPersonalization,
} from "./db";
import { routeOnboardingNicheSlugs } from "./onboardingRouteNiche";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "./utils/sanitizeAiOutput";
import { AI_FACT_CLAIM_GUARDRAIL } from "@shared/aiFactClaimGuardrail";
import { mapCoachScriptRow, type GeneratedCoachScript } from "./studioGenerateScript";
import { buildProductionNotesJson, combineBodyFromSections, countWords, flattenViralScriptForCopy } from "@shared/coachScriptSections";
import { assignScriptingTag } from "./ideaScriptExtras";

const SESSION_TTL_MS = 1000 * 60 * 30;

export type ScriptGeneratorSession = {
  topic: string;
  platform: string;
  length: string;
  tone: string;
  pack: ScriptPack;
  ts: number;
};

export type ScriptGeneratorPreviewResult = {
  meta: string[];
  /** Full pack is generated; UI hides post-retention beats + extras until signup. */
  pack: ScriptPack;
  freeBeats: ScriptPackBeat[];
  lockedBeatCount: number;
  sessionToken: string;
};

function platformToCoach(platform: string): "instagram" | "tiktok" | "both" {
  if (/tiktok/i.test(platform)) return "tiktok";
  if (/reel|instagram/i.test(platform)) return "instagram";
  return "both";
}

function encodeSession(session: ScriptGeneratorSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeScriptGeneratorSession(token: string): ScriptGeneratorSession {
  let parsed: ScriptGeneratorSession;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as ScriptGeneratorSession;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid session. Please generate your script again.",
    });
  }
  if (
    !parsed?.topic ||
    !parsed?.pack?.beats ||
    !Array.isArray(parsed.pack.beats) ||
    !parsed.ts ||
    Date.now() - parsed.ts > SESSION_TTL_MS
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Session expired. Please generate your script again.",
    });
  }
  const meta = Array.isArray(parsed.pack.meta) ? parsed.pack.meta : [parsed.platform].filter(Boolean);
  parsed.pack = normalizePack(parsed.pack as unknown as Record<string, unknown>, meta);
  return parsed;
}

function normalizePack(raw: Record<string, unknown>, meta: string[]): ScriptPack {
  const beatsRaw = Array.isArray(raw.beats) ? raw.beats : [];
  const beats: ScriptPackBeat[] = beatsRaw.slice(0, 4).map((b, i) => {
    const row = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const tag =
      String(row.tag ?? ["Hook", "Engagement", "Insight", "Takeaway + CTA"][i] ?? "Beat").trim() ||
      "Beat";
    return {
      tag,
      spoken: String(row.spoken ?? "").trim(),
      note: String(row.note ?? "").trim(),
      locked: i >= 2,
    };
  });

  while (beats.length < 4) {
    const i = beats.length;
    beats.push({
      tag: ["Hook", "Engagement", "Insight", "Takeaway + CTA"][i]!,
      spoken: "",
      note: "",
      locked: i >= 2,
    });
  }

  const filmingRaw = Array.isArray(raw.filming) ? raw.filming : [];
  const filming = filmingRaw.slice(0, 6).map((row) => {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    return {
      k: String(r.k ?? r.key ?? "").trim() || "Note",
      v: String(r.v ?? r.value ?? "").trim(),
    };
  });

  const hashtags = normalizeHashtags(raw.hashtags, meta);
  const instagramAudio = normalizeInstagramAudio(raw.instagramAudio);

  return {
    meta,
    beats: beats.map((b, i) => ({ ...b, locked: i >= 2 })),
    filming:
      filming.filter((f) => f.v).length > 0
        ? filming.filter((f) => f.v)
        : [{ k: "Setup", v: "Chest-up talking head, soft front light, clean background." }],
    caption: stripTrailingHashtags(String(raw.caption ?? "").trim()) || "Save this and film your next short this week.",
    hashtags,
    instagramAudio,
  };
}

function stripTrailingHashtags(caption: string): string {
  return caption.replace(/(?:\s*#[\w]+)+\s*$/g, "").trim();
}

function normalizeInstagramAudio(raw: unknown): ScriptPackAudioPick[] {
  const rows = Array.isArray(raw) ? raw : [];
  const picks: ScriptPackAudioPick[] = [];
  for (const row of rows.slice(0, 2)) {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    if (!title) continue;
    picks.push({
      title,
      artist: String(r.artist ?? "").trim() || "Unknown",
      searchHint: String(r.searchHint ?? r.search ?? title).trim() || title,
      matchReason: String(r.matchReason ?? r.reason ?? "").trim() || "Fits the script energy.",
      isTrending: picks.length === 0 ? true : Boolean(r.isTrending),
    });
  }
  if (picks.length >= 2) {
    picks[0]!.isTrending = true;
    picks[1]!.isTrending = false;
    return picks;
  }
  return [
    {
      title: "Confident Upbeat",
      artist: "Reels Audio",
      searchHint: "confident upbeat reel no lyrics",
      matchReason: "Primary: mid-tempo under talking head without fighting the hook.",
      isTrending: true,
    },
    {
      title: "Soft Motivation",
      artist: "Creator Beats",
      searchHint: "soft motivation beat reels",
      matchReason: "Backup if the primary is missing in Reels search.",
      isTrending: false,
    },
  ];
}

function normalizeHashtags(raw: unknown, meta: string[]): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const tag = value
      .replace(/^#/, "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^\w]/g, "");
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      out.push(tag);
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) push(String(item ?? ""));
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[\s,]+/)) push(part);
  }

  if (out.length === 0) {
    const joined = meta.join(" ").toLowerCase();
    if (joined.includes("tiktok")) {
      ["tiktok", "fyp", "contentcreator", "script", "viral"].forEach(push);
    } else if (joined.includes("reel") || joined.includes("instagram")) {
      ["reels", "instagramreels", "contentcreator", "script", "viral"].forEach(push);
    } else {
      ["shorts", "contentcreator", "script", "viral", "creator"].forEach(push);
    }
  }

  return out.slice(0, 10);
}

export async function previewScriptGeneratorPack(args: {
  topic: string;
  platform: string;
  length: string;
  tone: string;
}): Promise<ScriptGeneratorPreviewResult> {
  const topic = args.topic.trim();
  const platform = args.platform.trim();
  const length = args.length.trim();
  const tone = args.tone.trim();

  if (topic.length < 10) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Describe your video in a bit more detail." });
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a short-form video script strategist for Instagram Reels, TikTok, and YouTube Shorts. You write HEIT scripts (Hook, Engagement, Insight, Takeaway+CTA) that creators can film today. Respond with valid JSON only. No markdown. No code fences."
        ),
      },
      {
        role: "user",
        content: `Write a ready-to-film short-form script pack.

Topic / idea: "${topic}"
Platform: ${platform}
Length: ${length}
Tone: ${tone}

RULES:
- ${AI_FACT_CLAIM_GUARDRAIL}
- No em dashes anywhere.
- Spoken lines must sound like a real creator on camera, not generic AI.
- Hook: stop-the-scroll in the first 1 to 2 seconds (6 to 18 words).
- Engagement: prove relevance / personal stake in one beat.
- Insight: one clear valuable move tied to the topic.
- Takeaway + CTA: one action + soft save/follow CTA.
- Each beat needs a short filming note (on-screen text, cutaway, or delivery cue).
- Caption: one post caption with a soft CTA (no more than 280 chars). Do not put hashtags inside the caption string.
- Hashtags: 5 to 8 relevant hashtags as an array of strings WITHOUT the # symbol.
- Instagram audio: exactly 2 real Reels-searchable tracks (primary trending + backup). Title + artist only. No mood/tempo essays.

Return JSON with this exact shape:
{
  "beats": [
    { "tag": "Hook", "spoken": "...", "note": "..." },
    { "tag": "Engagement", "spoken": "...", "note": "..." },
    { "tag": "Insight", "spoken": "...", "note": "..." },
    { "tag": "Takeaway + CTA", "spoken": "...", "note": "..." }
  ],
  "filming": [
    { "k": "Setup", "v": "..." },
    { "k": "B-roll", "v": "..." },
    { "k": "Delivery", "v": "..." },
    { "k": "Cut points", "v": "..." }
  ],
  "caption": "...",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "instagramAudio": [
    {
      "title": "Exact track name",
      "artist": "Artist name",
      "searchHint": "Phrase to paste in Instagram Reels audio search",
      "matchReason": "Why this fits the script",
      "isTrending": true
    },
    {
      "title": "Backup track name",
      "artist": "Artist name",
      "searchHint": "Backup search phrase",
      "matchReason": "When to use this instead",
      "isTrending": false
    }
  ]
}`,
      },
    ],
    maxTokens: 2500,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = sanitizeAiOutputDeep(JSON.parse(raw)) as Record<string, unknown>;
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Script generation returned invalid output. Please try again.",
    });
  }

  const meta = [platform, length, `${tone} tone`];
  const pack = normalizePack(parsed, meta);
  if (!pack.beats[0]?.spoken || !pack.beats[1]?.spoken) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Script generation incomplete. Please try again.",
    });
  }

  const session: ScriptGeneratorSession = {
    topic,
    platform,
    length,
    tone,
    pack,
    ts: Date.now(),
  };

  return {
    meta,
    pack,
    freeBeats: pack.beats.filter((b) => !b.locked).map((b) => ({ ...b, locked: false })),
    lockedBeatCount: pack.beats.filter((b) => b.locked).length,
    sessionToken: encodeSession(session),
  };
}

function packRow(pack: ScriptPack, key: string): string {
  const hit = pack.filming.find((f) => f.k.toLowerCase() === key.toLowerCase());
  return hit?.v?.trim() || "";
}

function packToCoachFields(pack: ScriptPack) {
  const hook = pack.beats[0]?.spoken ?? "";
  const engagement = pack.beats[1]?.spoken ?? "";
  const insight = pack.beats[2]?.spoken ?? "";
  const takeaway = pack.beats[3]?.spoken ?? "";
  const hookNote = pack.beats[0]?.note?.trim() || "";

  const sections = {
    explain: engagement,
    illustrate: insight,
    teach: takeaway,
    cta: "",
  };

  const setup =
    packRow(pack, "Setup") ||
    pack.filming.map((f) => `${f.k}: ${f.v}`).join("\n") ||
    "Chest-up talking head, soft front light, clean background.";
  const delivery = packRow(pack, "Delivery");
  const brollRaw = packRow(pack, "B-roll") || packRow(pack, "Broll");
  const cutPoints = packRow(pack, "Cut points");
  const primaryAudio = pack.instagramAudio[0];
  const music = primaryAudio
    ? `${primaryAudio.title}${primaryAudio.artist ? ` · ${primaryAudio.artist}` : ""}`
    : undefined;

  const productionCoach: Record<string, unknown> = {
    setup,
    voiceTone: delivery || undefined,
    pacingNotes: cutPoints || undefined,
    music,
    musicMix: "Keep audio low under voice (about 8 to 12%). Duck during the spoken hook.",
    instagramAudio: pack.instagramAudio.slice(0, 2).map((pick) => ({
      title: pick.title,
      artist: pick.artist,
      searchHint: pick.searchHint,
      matchReason: pick.matchReason,
      isTrending: pick.isTrending,
    })),
    caption: pack.caption,
    hashtags: pack.hashtags,
    textOverlay: hookNote.slice(0, 80) || undefined,
    hookOnScreenText: hookNote.replace(/^on-screen:\s*/i, "").slice(0, 30) || undefined,
    frame0OnScreenText: hookNote.replace(/^on-screen:\s*/i, "").slice(0, 30) || undefined,
    bRoll: brollRaw
      ? brollRaw
          .split(/[,;]|\band\b/i)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6)
          .map((shot) => ({ shot, canUseStock: true }))
      : pack.beats
          .slice(1)
          .map((b) => b.note.trim())
          .filter(Boolean)
          .slice(0, 4)
          .map((shot) => ({ shot, canUseStock: true })),
    beatNotes: pack.beats.map((b) => `${b.tag}: ${b.note}`).join("\n"),
  };

  return {
    hook,
    sections,
    body: combineBodyFromSections(sections),
    ctaText: takeaway || insight,
    productionNotes: buildProductionNotesJson(productionCoach, sections, {
      contentFormat: "talking-head",
      sourceDescription: pack.meta.join(" · ").slice(0, 500),
    }),
  };
}

export async function claimScriptGeneratorToStudio(args: {
  userId: number;
  workspaceId: string;
  sessionToken: string;
}): Promise<GeneratedCoachScript> {
  const session = decodeScriptGeneratorSession(args.sessionToken);
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  }

  await updateUserPersonalization(args.userId, {
    businessDescription: session.topic.slice(0, 500),
    targetAudience: `${session.platform} viewers`,
  });

  const selectedSlugs = await routeOnboardingNicheSlugs(session.topic);
  await markOnboardingComplete(args.userId, selectedSlugs, [], null);

  const fields = packToCoachFields(session.pack);
  const title = session.topic.replace(/\s+/g, " ").trim().slice(0, 72) || "Untitled script";

  const insertResult = await db.insert(coachScripts).values({
    userId: args.userId,
    workspaceId: args.workspaceId,
    planCardId: null,
    title,
    hook: fields.hook.slice(0, 2000),
    body: fields.body,
    callToAction: fields.ctaText.slice(0, 2000),
    platform: platformToCoach(session.platform),
    tone: session.tone.slice(0, 64) || "conversational",
    estimatedDuration: session.length.slice(0, 64),
    contentType: "organic",
    contentFormat: "talking-head",
    formatLabel: session.platform.slice(0, 128),
    productionNotes: fields.productionNotes,
    productionNotesStatus: "completed",
  });

  const scriptId = insertResult[0]?.insertId;
  if (!scriptId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save script" });
  }

  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, scriptId)).limit(1);
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load script" });
  }

  const sections = {
    explain: fields.sections.explain,
    illustrate: fields.sections.illustrate,
    teach: fields.sections.teach,
    cta: fields.sections.cta,
  };
  const content = flattenViralScriptForCopy({
    title,
    hook: fields.hook,
    sections,
  });
  const hashtagsClean = session.pack.hashtags
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
  const captionTrimmed = session.pack.caption.trim();

  await ensureDefaultTags(args.workspaceId, args.userId);
  const savedId = await createSavedScript({
    userId: args.userId,
    workspaceId: args.workspaceId,
    title,
    content,
    originalContent: content,
    wordCount: countWords(content),
    status: "draft",
    notes: "Saved from AI script generator",
    coachScriptId: scriptId,
    generatedCaption: captionTrimmed || null,
    generatedHashtags: hashtagsClean.length > 0 ? JSON.stringify(hashtagsClean) : null,
    captionStyle: "educational",
  });
  await assignScriptingTag(savedId, args.workspaceId, args.userId);

  return mapCoachScriptRow(row);
}
