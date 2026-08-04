/**
 * Split a Reel script into B-roll beats with one LLM call (not per beat).
 */

import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";

export type ScriptBeat = {
  index: number;
  scriptText: string;
  visualSummary: string;
  searchQuery: string;
};

type LlmBeatPayload = {
  beats?: Array<{
    scriptText?: string;
    script_text?: string;
    visualSummary?: string;
    visual_summary?: string;
    searchQuery?: string;
    search_query?: string;
  }>;
};

function normalizeBeats(raw: LlmBeatPayload, content: string): ScriptBeat[] {
  const list = Array.isArray(raw.beats) ? raw.beats : [];
  const beats: ScriptBeat[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const scriptText = String(item.scriptText ?? item.script_text ?? "").trim();
    const visualSummary = String(
      item.visualSummary ?? item.visual_summary ?? ""
    ).trim();
    const searchQuery = String(
      item.searchQuery ?? item.search_query ?? visualSummary
    ).trim();
    if (!visualSummary && !searchQuery) continue;
    beats.push({
      index: beats.length,
      scriptText: scriptText || content.slice(0, 120),
      visualSummary: visualSummary || searchQuery,
      searchQuery: searchQuery || visualSummary,
    });
  }
  return beats;
}

/** Fallback when LLM fails: chunk the script into ~3-5 rough beats. */
function fallbackBeats(content: string): ScriptBeat[] {
  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) {
    return [
      {
        index: 0,
        scriptText: content.slice(0, 160),
        visualSummary: content.slice(0, 80),
        searchQuery: content.slice(0, 60),
      },
    ];
  }

  const targetCount = Math.min(5, Math.max(3, Math.ceil(sentences.length / 2)));
  const chunkSize = Math.max(1, Math.ceil(sentences.length / targetCount));
  const beats: ScriptBeat[] = [];
  for (let i = 0; i < sentences.length && beats.length < 6; i += chunkSize) {
    const chunk = sentences.slice(i, i + chunkSize).join(" ");
    const summary = chunk.split(/\s+/).slice(0, 8).join(" ");
    beats.push({
      index: beats.length,
      scriptText: chunk.slice(0, 220),
      visualSummary: summary,
      searchQuery: summary,
    });
  }
  return beats;
}

/**
 * One LLM call → beats with short visual-search-friendly summaries.
 */
export async function splitScriptIntoBeats(
  content: string,
  niche?: string
): Promise<ScriptBeat[]> {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const nicheHint = niche?.trim()
    ? `Niche context: ${niche.trim()}.`
    : "";

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You split short-form video scripts into B-roll beats for stock video search.
Return ONLY valid JSON:
{"beats":[{"scriptText":"...","visualSummary":"...","searchQuery":"..."}]}

Rules:
- Aim for 3 to 6 beats covering the full script in order.
- scriptText: short paraphrase or excerpt of that beat (max ~25 words).
- visualSummary: what the viewer should SEE (concrete, filmable, no abstract concepts).
- searchQuery: 2 to 6 words ideal for a stock video API (nouns, actions, settings). No quotes.
- Prefer portrait-friendly, real-world scenes over text-on-screen ideas.
- Do not invent product logos or celebrity faces.
${nicheHint}`,
        },
        {
          role: "user",
          content: `Script:\n---\n${trimmed.slice(0, 4000)}\n---`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = String(response.choices[0]?.message?.content ?? "");
    const parsed = parseLlmJson<LlmBeatPayload>(raw, { beats: [] });
    const beats = normalizeBeats(parsed, trimmed);
    if (beats.length > 0) return beats;
    console.warn("[splitScriptIntoBeats] empty LLM beats, using fallback");
    return fallbackBeats(trimmed);
  } catch (err) {
    console.warn("[splitScriptIntoBeats] LLM failed, using fallback", err);
    return fallbackBeats(trimmed);
  }
}
