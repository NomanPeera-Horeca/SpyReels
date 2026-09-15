import Anthropic from "@anthropic-ai/sdk";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";

export const YOUTUBE_QUERY_MODEL = "claude-haiku-4-5-20251001";

const QUERY_PROMPT = `You generate keyword search phrases for discovering strong YouTube Shorts in SpyReels.

The caller gives you one creator niche and one content pillar. Convert them into the short keyword phrases people and creators would actually type into YouTube search.

Return ONLY valid JSON in this exact shape:
{"queries":["query one","query two"]}

RULES:
1. Every query must clearly stay inside the supplied niche and pillar.
2. Use keyword-style searches, not sentences and not questions.
3. Each query must contain 2 to 4 words total.
4. Prefer concrete niche terms, audience terms, occupations, outcomes, tactics, and creator vocabulary.
5. Avoid filler words such as how, to, the, a, an, that, actually, really, best, fast, and work unless they are essential to the niche meaning.
6. Make the queries meaningfully different while still targeting the same pillar.
7. Do not simply repeat an abstract internal taxonomy phrase when a more natural YouTube keyword phrase exists.
8. Do not include YouTube, Shorts, hashtags, dates, quotation marks, or platform names.
9. Do not invent a different niche or pillar.
10. Never hard-code assumptions about restaurants, fitness, real estate, beauty, finance, or any other niche. Use only the supplied niche and pillar.
11. Return exactly the requested number of queries.
12. Do not use em dashes.
13. Return JSON only.`;

function compact(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function keywordWordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function uniqueQueries(values: unknown[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const query = compact(value).replace(/^['"]|['"]$/g, "");
    const key = query.toLowerCase();
    const words = keywordWordCount(query);
    if (!query || query.length > 64 || words < 2 || words > 4 || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= limit) break;
  }
  return out;
}

function firstWords(value: string, count: number): string {
  return value.split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

export function buildYouTubeQueryFallback(args: {
  niche: string;
  pillar: string;
  limit: number;
}): string[] {
  const niche = compact(args.niche).replace(/&/g, " ");
  const pillar = compact(args.pillar).replace(/&/g, " ");
  const limit = Math.max(1, Math.min(3, Math.floor(args.limit)));
  const nicheHead = firstWords(niche, 2);
  const pillarHead = firstWords(pillar, 2);

  const fallback = uniqueQueries(
    [
      nicheHead && pillarHead ? `${nicheHead} ${pillarHead}` : "",
      nicheHead ? `${nicheHead} tips` : "",
      pillarHead ? `${pillarHead} tips` : "",
    ],
    limit
  );

  if (fallback.length >= limit) return fallback;
  return uniqueQueries(
    [...fallback, `${nicheHead || "creator"} growth`, `${pillarHead || "content"} strategy`],
    limit
  );
}

export function normalizeYouTubeQueryResponse(
  raw: unknown,
  limit: number
): string[] {
  const boundedLimit = Math.max(1, Math.min(3, Math.floor(limit)));
  if (!raw || typeof raw !== "object") return [];
  const queries = (raw as { queries?: unknown }).queries;
  return Array.isArray(queries) ? uniqueQueries(queries, boundedLimit) : [];
}

function stripCodeFences(text: string): string {
  let value = text.trim();
  if (value.startsWith("```")) {
    value = value
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
  }
  return value.trim();
}

export async function generateYouTubeShortsSearchQueries(args: {
  niche: string;
  pillar: string;
  limit: number;
}): Promise<{ queries: string[]; aiGenerated: boolean }> {
  const niche = compact(args.niche);
  const pillar = compact(args.pillar);
  const limit = Math.max(1, Math.min(3, Math.floor(args.limit)));
  const fallback = buildYouTubeQueryFallback({ niche, pillar, limit });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { queries: fallback, aiGenerated: false };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: YOUTUBE_QUERY_MODEL,
      max_tokens: 220,
      temperature: 0.05,
      system: QUERY_PROMPT,
      messages: [
        {
          role: "user",
          content: `CURRENT NICHE: ${niche || "General creator niche"}\nCONTENT PILLAR: ${pillar || "General content"}\nNUMBER OF QUERIES: ${limit}`,
        },
      ],
    });
    reportDirectAnthropicUsage(response, "youtube_search_query_generation");
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from YouTube query generator");
    }
    const parsed = JSON.parse(stripCodeFences(textBlock.text));
    const queries = normalizeYouTubeQueryResponse(parsed, limit);
    if (queries.length !== limit) {
      throw new Error(`YouTube query generator returned ${queries.length}/${limit} valid keyword queries`);
    }
    return { queries, aiGenerated: true };
  } catch (error) {
    console.warn("[viralPosts.youtube] query_generation_fallback", {
      niche,
      pillar,
      error: error instanceof Error ? error.message : String(error),
    });
    return { queries: fallback, aiGenerated: false };
  }
}
