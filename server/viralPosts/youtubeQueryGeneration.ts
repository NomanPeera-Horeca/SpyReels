import Anthropic from "@anthropic-ai/sdk";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";

export const YOUTUBE_QUERY_MODEL = "claude-haiku-4-5-20251001";

const QUERY_PROMPT = `You generate search phrases for discovering strong YouTube Shorts in SpyReels.

The caller gives you one creator niche and one content pillar. Translate that abstract pillar into the practical language real creators actually use in video titles and searches.

Return ONLY valid JSON in this exact shape:
{"queries":["query one","query two"]}

RULES:
1. Each query must clearly belong to the supplied niche.
2. Prefer concrete audience language, problems, outcomes, tactics, and how-to phrasing over internal business taxonomy.
3. Do not simply repeat the niche plus pillar if that sounds unnatural.
4. Keep each query short, usually 3 to 7 words.
5. Make the queries meaningfully different so they explore different creator language for the same pillar.
6. Do not include YouTube, Shorts, hashtags, dates, quotation marks, or platform names.
7. Do not invent a different niche or pillar.
8. Never hard-code assumptions about restaurants, fitness, real estate, beauty, finance, or any other niche. Use only the supplied niche and pillar.
9. Return exactly the requested number of queries.
10. Do not use em dashes.
11. Return JSON only.`;

function compact(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueQueries(values: unknown[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const query = compact(value).replace(/^['"]|['"]$/g, "");
    const key = query.toLowerCase();
    if (!query || query.length > 90 || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildYouTubeQueryFallback(args: {
  niche: string;
  pillar: string;
  limit: number;
}): string[] {
  const niche = compact(args.niche);
  const pillar = compact(args.pillar);
  const limit = Math.max(1, Math.min(3, Math.floor(args.limit)));
  return uniqueQueries(
    [
      niche && pillar ? `${pillar} for ${niche}` : "",
      niche && pillar ? `${niche} ${pillar} tips` : "",
      niche ? `${niche} tips` : pillar,
    ],
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
      max_tokens: 260,
      temperature: 0.1,
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
      throw new Error(`YouTube query generator returned ${queries.length}/${limit} queries`);
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
