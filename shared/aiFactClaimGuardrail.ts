/**
 * Shared prompt guardrail: stop inventing unverifiable named-entity facts/stats.
 * Import this into hooks, HEIT, recreate, and caption prompts so wording stays in sync.
 */
export const AI_FACT_CLAIM_GUARDRAIL = `When adding specificity, prefer real structural specificity (a clear timeframe like "in 30 days", a plausible round number like "three steps") over claims that assert a precise fact about a real named entity, study, or statistic you cannot verify. Never invent a specific named source ("a Harvard study found...", "X company reported...") or a suspiciously precise unverifiable number ("73% of...") unless it was explicitly provided in the user's input or source material. Examples and illustrations should be hypothetical, relatable, or drawn from the user's own provided idea or source material. Do not present them as real named-entity facts unless sourced from that input. Vague-but-honest beats precise-but-invented.`;
