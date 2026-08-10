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

export type SplitScriptResult = {
  theme: string;
  beats: ScriptBeat[];
};

type LlmBeatPayload = {
  theme?: string;
  narrativeTheme?: string;
  narrative_theme?: string;
  beats?: Array<{
    scriptText?: string;
    script_text?: string;
    visualSummary?: string;
    visual_summary?: string;
    searchQuery?: string;
    search_query?: string;
  }>;
};

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Split into sentence-like chunks for coverage heuristics / fallback.
 * Numbered list markers ("1.", "2.") are kept with the following text so
 * they do not inflate the sentence count or force fragmented beats.
 */
function splitSentences(content: string): string[] {
  const normalized = content
    .replace(/(^|\n)\s*(\d+)\.\s+/g, "$1$2. ")
    .replace(/\n+/g, " ");
  return normalized
    .split(/(?<=(?<!\d)[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Minimum beats expected for adequate start-to-finish script coverage.
 * Scales with word count; does not force short scripts past their natural beat count.
 * Rough targets: ~60 words → 2-3, ~100 words with a numbered list → ~5-8, long scripts up to 12.
 */
export function minBeatsForScript(content: string): number {
  const words = countWords(content);
  const sentences = splitSentences(content).length;

  if (words === 0) return 0;
  if (words < 30) return 1;
  if (words < 60) return Math.max(2, Math.min(Math.max(sentences, 2), 3));

  // ~1 beat per 35 words keeps a 100-word script near 3-4 from words alone.
  const byWords = Math.ceil(words / 35);
  // Soft sentence signal: do not let noisy punctuation dominate.
  const bySentences = Math.max(1, Math.ceil(sentences * 0.6));
  // Soft ceiling for medium scripts so a ~100w piece stays in the 5-8 band.
  const softCap = words < 160 ? 8 : 12;
  return Math.min(softCap, Math.max(3, byWords, Math.min(bySentences, softCap)));
}

function isUnderCovered(beats: ScriptBeat[], content: string): boolean {
  return beats.length > 0 && beats.length < minBeatsForScript(content);
}

function normalizeTheme(raw: LlmBeatPayload): string {
  return String(
    raw.theme ?? raw.narrativeTheme ?? raw.narrative_theme ?? ""
  )
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

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

/** Fallback when LLM fails or under-covers: one beat per sentence chunk. */
function fallbackBeats(content: string): SplitScriptResult {
  const sentences = splitSentences(content);
  if (!sentences.length) {
    return {
      theme: "",
      beats: [
        {
          index: 0,
          scriptText: content.slice(0, 160),
          visualSummary: content.slice(0, 80),
          searchQuery: content.slice(0, 60),
        },
      ],
    };
  }

  const minBeats = minBeatsForScript(content);
  const targetCount = Math.min(
    12,
    Math.max(minBeats, Math.min(sentences.length, Math.max(3, Math.ceil(sentences.length))))
  );
  const chunkSize = Math.max(1, Math.ceil(sentences.length / targetCount));
  const beats: ScriptBeat[] = [];
  for (let i = 0; i < sentences.length && beats.length < 12; i += chunkSize) {
    const chunk = sentences.slice(i, i + chunkSize).join(" ");
    const summary = chunk.split(/\s+/).slice(0, 8).join(" ");
    beats.push({
      index: beats.length,
      scriptText: chunk.slice(0, 220),
      visualSummary: summary,
      searchQuery: summary,
    });
  }
  return { theme: "", beats };
}

function buildSystemPrompt(args: {
  nicheHint: string;
  minBeats: number;
  strict: boolean;
}): string {
  const coverageRule = args.strict
    ? `CRITICAL RETRY: Previous output under-covered the script. You MUST return at least ${args.minBeats} beats. Cover the ENTIRE script from the first line to the last. Roughly one beat per sentence or natural pause. Do not collapse a multi-sentence script into a few summary beats.`
    : `You MUST return enough beats to cover the ENTIRE script from start to finish (roughly one beat per sentence or natural pause). For this script produce at least ${args.minBeats} beats. Never return a single beat for a multi-sentence script. Do not soft-target a small fixed range.`;

  return `You split short-form video scripts into B-roll beats for stock video search.
Return ONLY valid JSON:
{"theme":"...","beats":[{"scriptText":"...","visualSummary":"...","searchQuery":"..."}]}

Rules:
- ${coverageRule}
- Beats must stay in script order and together span the full narrative.
- theme: 1 to 4 words naming the overall narrative mood or arc (examples: betrayal tension, quiet triumph, anxious waiting, redemptive resolve). Theme may be emotional or abstract.
- scriptText: short paraphrase or excerpt of that beat (max ~25 words).
- visualSummary: what the viewer should SEE for this beat. Concrete and filmable, but may reflect the mood from theme.
- searchQuery: 2 to 6 words for a stock video API. Must combine THIS beat's visual subjects with the overall narrative theme or mood (tension, betrayal, triumph, intimacy, urgency, etc.). Theme should inform the query, not be banned. Prefer evocative but searchable terms. No quotes.
- Prefer portrait-friendly, real-world scenes over text-on-screen ideas.
- Do not invent product logos or celebrity faces.
${args.nicheHint}`;
}

async function requestBeats(
  content: string,
  nicheHint: string,
  minBeats: number,
  strict: boolean
): Promise<SplitScriptResult> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({ nicheHint, minBeats, strict }),
      },
      {
        role: "user",
        content: `Script:\n---\n${content.slice(0, 4000)}\n---`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "");
  const parsed = parseLlmJson<LlmBeatPayload>(raw, { beats: [] });
  return {
    theme: normalizeTheme(parsed),
    beats: normalizeBeats(parsed, content),
  };
}

/**
 * One LLM call → beats with short visual-search-friendly summaries.
 * Retries once when output is suspiciously under-covered, then may use fallback.
 */
export async function splitScriptIntoBeats(
  content: string,
  niche?: string
): Promise<SplitScriptResult> {
  const trimmed = content.trim();
  if (!trimmed) return { theme: "", beats: [] };

  const nicheHint = niche?.trim()
    ? `Niche context: ${niche.trim()}.`
    : "";
  const minBeats = minBeatsForScript(trimmed);

  try {
    let result = await requestBeats(trimmed, nicheHint, minBeats, false);

    if (isUnderCovered(result.beats, trimmed)) {
      console.warn(
        `[splitScriptIntoBeats] under-covered (${result.beats.length} < ${minBeats}), retrying with stricter coverage`
      );
      const retryResult = await requestBeats(trimmed, nicheHint, minBeats, true);
      if (retryResult.beats.length >= result.beats.length) {
        result = {
          theme: retryResult.theme || result.theme,
          beats: retryResult.beats,
        };
      }

      if (isUnderCovered(result.beats, trimmed)) {
        const fallback = fallbackBeats(trimmed);
        if (fallback.beats.length > result.beats.length) {
          console.warn(
            `[splitScriptIntoBeats] still under-covered after retry (${result.beats.length} < ${minBeats}), using fallback (${fallback.beats.length} beats)`
          );
          return { theme: result.theme, beats: fallback.beats };
        }
      }
    }

    if (result.beats.length > 0) return result;
    console.warn("[splitScriptIntoBeats] empty LLM beats, using fallback");
    return fallbackBeats(trimmed);
  } catch (err) {
    console.warn("[splitScriptIntoBeats] LLM failed, using fallback", err);
    return fallbackBeats(trimmed);
  }
}
