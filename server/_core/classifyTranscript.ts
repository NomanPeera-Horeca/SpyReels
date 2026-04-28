import { invokeLLM } from "./llm";
import {
  updateFeaturedReelClassification,
  updateReelClassification,
} from "../db";

const CONTENT_TYPES = [
  "educational",
  "story",
  "opinion",
  "personal",
  "reaction",
  "skit",
  "music",
  "other",
] as const;

const SUGGESTED_ACTIONS = [
  "make_version",
  "save_inspiration",
  "view_only",
] as const;

function buildPrompt(transcript: string): string {
  return `You are classifying Instagram Reels transcripts to determine if they're worth remaking.

Transcript:
"""
${transcript}
"""

Classify and return JSON:

{
  "contentType": "educational|story|opinion|personal|reaction|skit|music|other",
  "remakeabilityScore": <integer 0 to 10>,
  "suggestedAction": "make_version|save_inspiration|view_only",
  "reason": "<max 200 chars>"
}

Definitions:
- educational: teaches something concrete (how-to, tips, facts, frameworks)
- story: narrative with beginning, middle, end, transferable structure
- opinion: point of view that could be remixed with different opinion
- personal: creator's specific life moment ('I just got engaged', 'today I'm at')
- reaction: emotional response to external content (wow, no way)
- skit: comedy bit with specific characters
- music: lyrics or sound-driven, no spoken value
- other: doesn't fit above

Scoring:
- 8 to 10: Highly remakeable (educational, opinion, transferable story) -> make_version
- 4 to 7: Possibly remakeable but weak -> save_inspiration
- 0 to 3: Not remakeable (personal, skit, music) -> view_only
`;
}

function tryParseClassificationJson(rawInput: string): unknown | null {
  const raw = String(rawInput).trim();
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(
        raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      );
    } catch {
      return null;
    }
  }
}

export async function classifyTranscript(args: {
  transcript: string;
  reelId: number;
  table: "featured_reels" | "reels";
}): Promise<void> {
  const trimmed = args.transcript.trim();
  if (!trimmed) return;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 5) return;

  try {
    const response = await invokeLLM({
      messages: [{ role: "user", content: buildPrompt(trimmed) }],
      model: "claude-sonnet-4-6",
      temperature: 0.2,
      maxTokens: 300,
      response_format: { type: "json_object" },
    });

    const rawText = String(
      response.choices[0]?.message?.content ?? ""
    ).trim();

    const parsed = tryParseClassificationJson(rawText);
    if (parsed === null) {
      console.error("[classifyTranscript] JSON parse failed");
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      console.error("[classifyTranscript] Invalid JSON shape");
      return;
    }

    const obj = parsed as Record<string, unknown>;
    const contentType = obj.contentType;
    const remakeabilityScore = obj.remakeabilityScore;
    const suggestedAction = obj.suggestedAction;
    const reason = obj.reason;

    if (
      typeof contentType !== "string" ||
      !(CONTENT_TYPES as readonly string[]).includes(contentType)
    ) {
      console.error("[classifyTranscript] Invalid or missing contentType");
      return;
    }

    if (
      typeof remakeabilityScore !== "number" ||
      !Number.isInteger(remakeabilityScore) ||
      remakeabilityScore < 0 ||
      remakeabilityScore > 10
    ) {
      console.error("[classifyTranscript] Invalid remakeabilityScore");
      return;
    }

    if (
      typeof suggestedAction !== "string" ||
      !(SUGGESTED_ACTIONS as readonly string[]).includes(suggestedAction)
    ) {
      console.error("[classifyTranscript] Invalid or missing suggestedAction");
      return;
    }

    if (typeof reason !== "string") {
      console.error("[classifyTranscript] Invalid or missing reason");
      return;
    }

    const classificationReason =
      reason.length > 255 ? reason.slice(0, 255) : reason;

    const payload = {
      contentType,
      remakeabilityScore,
      suggestedAction,
      classificationReason,
    };

    if (args.table === "featured_reels") {
      await updateFeaturedReelClassification(args.reelId, payload);
    } else {
      await updateReelClassification(args.reelId, payload);
    }
  } catch (err) {
    console.error("[classifyTranscript]", err);
  }
}
