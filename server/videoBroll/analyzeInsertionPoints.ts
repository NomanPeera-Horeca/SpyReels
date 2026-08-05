/**
 * LLM analysis: transcript segments → timed B-roll insertion points.
 * Uses Claude Sonnet (invokeLLM default) with structured JSON schema.
 *
 * Token estimate (10-min talking-head, ~150 wpm, ~200 utterance segments):
 *   segments JSON ~2.5-3.5k tokens + ~700 system = ~3-4k input.
 *   Output ~40-75 points = ~2-4k tokens.
 * Well under Sonnet context; no chunking needed at the 10-min cap.
 */

import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";
import type {
  VideoBrollInsertionPoint,
  VideoBrollTranscriptSegment,
} from "../../shared/videoBroll";

type LlmInsertionPayload = {
  insertionPoints?: Array<{
    timestampSeconds?: number;
    timestamp_seconds?: number;
    reason?: string;
    searchQuery?: string;
    search_query?: string;
  }>;
};

const INSERTION_POINTS_SCHEMA = {
  type: "object",
  properties: {
    insertionPoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestampSeconds: {
            type: "number",
            description: "Seconds into the video where B-roll should cut in",
          },
          reason: {
            type: "string",
            description: "Why this is a good visual reset or cut point",
          },
          searchQuery: {
            type: "string",
            description: "2 to 6 word Pexels stock video search query",
          },
        },
        required: ["timestampSeconds", "reason", "searchQuery"],
        additionalProperties: false,
      },
    },
  },
  required: ["insertionPoints"],
  additionalProperties: false,
} as const;

function buildSystemPrompt(durationSeconds: number | null): string {
  const densityHint =
    typeof durationSeconds === "number" && durationSeconds > 0
      ? `Video duration is about ${Math.round(durationSeconds)} seconds. Aim for roughly ${Math.max(1, Math.round(durationSeconds / 12))} to ${Math.max(1, Math.round(durationSeconds / 8))} insertion points (about one every 8 to 15 seconds), adjusting for content density.`
      : `Target roughly one insertion every 8 to 15 seconds of talking, guided by content density (denser topics may be closer; sparse talk may be farther).`;

  return `You analyze timed talking-head video transcripts and suggest B-roll insertion points for stock video overlays.

Return ONLY valid JSON matching the schema:
{"insertionPoints":[{"timestampSeconds":12.5,"reason":"...","searchQuery":"..."}]}

Rules:
- Suggest meaningful visual resets, NOT one point per transcript segment.
- ${densityHint}
- Prefer points at: topic or keyword shifts, concrete visual nouns the speaker names, natural pauses between ideas, and jump-cut hide spots (breath, "um", sentence boundaries).
- timestampSeconds must fall within the video timeline (use segment start/end times). Prefer the start of the relevant idea or the pause just before it.
- reason: one short sentence explaining why this cut helps (max ~20 words).
- searchQuery: 2 to 6 words for a stock video API. Concrete, filmable, portrait-friendly real-world scenes. No quotes, no product logos, no celebrity faces.
- Keep insertionPoints in ascending timestamp order.
- If the transcript is very short (<15s), return 1 point when a visual exists; otherwise return an empty array.`;
}

function normalizePoints(
  raw: LlmInsertionPayload,
  durationSeconds: number | null
): Array<Pick<VideoBrollInsertionPoint, "timestampSeconds" | "reason" | "searchQuery">> {
  const list = Array.isArray(raw.insertionPoints) ? raw.insertionPoints : [];
  const maxTs =
    typeof durationSeconds === "number" && durationSeconds > 0
      ? durationSeconds
      : Number.POSITIVE_INFINITY;

  const points: Array<
    Pick<VideoBrollInsertionPoint, "timestampSeconds" | "reason" | "searchQuery">
  > = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const tsRaw = item.timestampSeconds ?? item.timestamp_seconds;
    const ts = typeof tsRaw === "number" ? tsRaw : Number(tsRaw);
    if (!Number.isFinite(ts) || ts < 0) continue;
    const reason = String(item.reason ?? "").trim();
    const searchQuery = String(
      item.searchQuery ?? item.search_query ?? ""
    ).trim();
    if (!searchQuery) continue;
    points.push({
      timestampSeconds: Math.min(ts, maxTs),
      reason: reason || "Visual reset for this beat",
      searchQuery,
    });
  }

  points.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  return points;
}

/**
 * One Sonnet call → timed insertion points with Pexels-ready search queries.
 * Does not attach Pexels clips (see matchPexelsForInsertions).
 */
export async function analyzeInsertionPoints(args: {
  segments: VideoBrollTranscriptSegment[];
  durationSeconds?: number | null;
}): Promise<
  Array<Pick<VideoBrollInsertionPoint, "timestampSeconds" | "reason" | "searchQuery">>
> {
  const segments = args.segments.filter(
    (s) => s && typeof s.text === "string" && s.text.trim()
  );
  if (!segments.length) return [];

  const compact = segments.map((s) => ({
    start: Math.round(s.start * 100) / 100,
    end: Math.round(s.end * 100) / 100,
    text: s.text.trim(),
  }));

  const response = await invokeLLM({
    // Default model is claude-sonnet-4-6 (real reasoning, not Haiku).
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(args.durationSeconds ?? null),
      },
      {
        role: "user",
        content: `Transcript segments (start/end in seconds):\n${JSON.stringify(compact)}`,
      },
    ],
    maxTokens: 8192,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "video_broll_insertion_points",
        strict: true,
        schema: INSERTION_POINTS_SCHEMA,
      },
    },
  });

  const raw = String(response.choices[0]?.message?.content ?? "");
  const parsed = parseLlmJson<LlmInsertionPayload>(raw, { insertionPoints: [] });
  return normalizePoints(parsed, args.durationSeconds ?? null);
}
