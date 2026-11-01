/**
 * Meaning embeddings for the viral library: one per video summary and one
 * per creator strategy, so unusual niches match by meaning and the topic list
 * can grow without re-tagging the library.
 *
 * Uses OpenAI text-embedding-3-small (512 dims) with the OPENAI_API_KEY the
 * app already has. No key, or any error, returns null; callers keep going
 * without an embedding.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 512;

/** After OpenAI refuses (quota, rate limit), skip calls for a while instead of failing every video. */
const PAUSE_AFTER_REFUSAL_MS = 30 * 60 * 1000;
let pausedUntil = 0;

export function resetEmbeddingPauseForTests(): void {
  pausedUntil = 0;
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  const input = texts.map(t => t.replace(/\s+/g, " ").trim().slice(0, 2_000));
  if (!key || input.length === 0 || input.some(t => !t)) return null;
  if (Date.now() < pausedUntil) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMENSIONS }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      let code = "";
      try {
        const body = (await res.json()) as { error?: { code?: string; type?: string } };
        code = body.error?.code || body.error?.type || "";
      } catch {
        // no body
      }
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        pausedUntil = Date.now() + PAUSE_AFTER_REFUSAL_MS;
      }
      console.warn("[viralLibrary] embedding_failed", {
        status: res.status,
        code,
        pausedMinutes: pausedUntil > Date.now() ? 30 : 0,
      });
      return null;
    }
    const body = (await res.json()) as { data?: Array<{ index: number; embedding: number[] }> };
    const rows = (body.data ?? []).slice().sort((a, b) => a.index - b.index).map(d => d.embedding);
    return rows.length === input.length ? rows.map(roundVector) : null;
  } catch (err) {
    console.warn("[viralLibrary] embedding_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** 5 decimals keep the meaning and halve the stored size. */
function roundVector(v: number[]): number[] {
  return v.map(x => Math.round(x * 100_000) / 100_000);
}

/** Cosine similarity of two vectors (0 when either is empty). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}
