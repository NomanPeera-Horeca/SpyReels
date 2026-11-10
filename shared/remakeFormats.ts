/**
 * Content Prism formats for remaking a creator's OWN winning video: the same
 * idea and topic, a new format with a hook that fits it. Shared by the server
 * (prompt + format ranking) and the Remake popup ("Change format").
 */
export type PrismFormat = {
  id: string;
  /** Name shown on the option card and in Change format (Figma 1757:1239). */
  label: string;
  /** Short line under the name in Change format. */
  short: string;
  /** How the script should be built (prompt). */
  how: string;
};

export const PRISM_FORMATS: readonly PrismFormat[] = [
  { id: "mistake", label: "Mistake breakdown", short: "The mistake most people make", how: "show the mistake most people make here and what to do instead" },
  { id: "myth", label: "Myth-bust", short: "Name the belief, prove it wrong", how: "name a common belief about this topic and prove it wrong" },
  { id: "story", label: "Story", short: "Your own turning point", how: "tell it as a short personal story with a turning point" },
  { id: "how_to", label: "How-to", short: "Clear steps to follow today", how: "teach it as clear steps someone can follow today" },
  { id: "question", label: "Top question", short: "Answer the #1 question", how: "answer the #1 question people ask about this topic" },
  { id: "before_after", label: "Before / after", short: "What changed in between", how: "show the before and the after, and what changed in between" },
  { id: "result", label: "Result first", short: "Lead with the result", how: "lead with the result, then show how it happened" },
  { id: "problem_solution", label: "Problem → solution", short: "The pain, then the fix", how: "open with the painful problem, then give the fix" },
  { id: "list", label: "List", short: "3 to 5 quick points", how: "make it a quick numbered list (3-5 points)" },
  { id: "meme", label: "Meme / skit", short: "A short relatable skit", how: "turn it into a short relatable meme or skit" },
];

export const PRISM_FORMAT_IDS = PRISM_FORMATS.map(f => f.id);

export function prismFormat(id: string | null | undefined): PrismFormat | null {
  return PRISM_FORMATS.find(f => f.id === id) ?? null;
}

/** A format picked for one video, with a one-line pitch for that video. */
export type FormatPick = { id: string; pitch: string };
