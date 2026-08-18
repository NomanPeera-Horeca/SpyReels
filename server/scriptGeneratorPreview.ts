import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  type ScriptPack,
  type ScriptPackBeat,
} from "@shared/scriptGeneratorLanding";
import { coachScripts } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { getDb, markOnboardingComplete, updateUserPersonalization } from "./db";
import { routeOnboardingNicheSlugs } from "./onboardingRouteNiche";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "./utils/sanitizeAiOutput";
import { AI_FACT_CLAIM_GUARDRAIL } from "@shared/aiFactClaimGuardrail";
import { mapCoachScriptRow, type GeneratedCoachScript } from "./studioGenerateScript";
import { buildProductionNotesJson, combineBodyFromSections } from "@shared/coachScriptSections";

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

  const musicRaw = Array.isArray(raw.music) ? raw.music : [];
  const music = musicRaw.slice(0, 6).map((row) => {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    return {
      k: String(r.k ?? r.key ?? "").trim() || "Note",
      v: String(r.v ?? r.value ?? "").trim(),
    };
  });

  return {
    meta,
    beats: beats.map((b, i) => ({ ...b, locked: i >= 2 })),
    filming:
      filming.filter((f) => f.v).length > 0
        ? filming.filter((f) => f.v)
        : [{ k: "Setup", v: "Chest-up talking head, soft front light, clean background." }],
    caption: String(raw.caption ?? "").trim() || "Save this and film your next short this week.",
    music:
      music.filter((m) => m.v).length > 0
        ? music.filter((m) => m.v)
        : [{ k: "Mood", v: "Confident, modern, slight urgency." }],
  };
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
- Caption: one post caption with a soft CTA (no more than 280 chars).
- Music: mood, tempo, avoid, and drop cues.

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
  "music": [
    { "k": "Mood", "v": "..." },
    { "k": "Tempo", "v": "..." },
    { "k": "Avoid", "v": "..." },
    { "k": "Drop", "v": "..." }
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
    freeBeats: pack.beats.filter((b) => !b.locked).map((b) => ({ ...b, locked: false })),
    lockedBeatCount: pack.beats.filter((b) => b.locked).length,
    sessionToken: encodeSession(session),
  };
}

function packToCoachFields(pack: ScriptPack) {
  const hook = pack.beats[0]?.spoken ?? "";
  const engagement = pack.beats[1]?.spoken ?? "";
  const insight = pack.beats[2]?.spoken ?? "";
  const takeaway = pack.beats[3]?.spoken ?? "";

  const sections = {
    explain: engagement,
    illustrate: insight,
    teach: "",
    cta: takeaway,
  };

  const productionCoach: Record<string, unknown> = {
    filmingNotes: pack.filming.map((f) => `${f.k}: ${f.v}`).join("\n"),
    caption: pack.caption,
    musicDirection: pack.music.map((m) => `${m.k}: ${m.v}`).join("\n"),
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
  });

  const scriptId = insertResult[0]?.insertId;
  if (!scriptId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save script" });
  }

  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, scriptId)).limit(1);
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load script" });
  }

  return mapCoachScriptRow(row);
}
