import Anthropic from "@anthropic-ai/sdk";
import type {
  NicheRoutingInput,
  NicheRoutingOutput,
} from "../types";
import { NICHES } from "../types";

const SYSTEM_PROMPT = `You are SpyReels' niche routing engine. A user has described their business in their own words. Your job is to map their description to the niches in our curated viral Reels library so we can show them creators whose content patterns will help them grow.

CRITICAL DISTINCTION: Map to where the user's BUYERS pay attention on Instagram, not to the literal industry the user operates in. A B2B restaurant equipment seller does not need food creators. They need business creators that restaurant owners follow. A wedding photographer does not need photography creators. They need wedding and lifestyle creators that brides follow.

Available niches (use these EXACT strings, no variants):
${NICHES.join(", ")}

Return ONLY valid JSON with this exact shape:

{
  "primary_niche": "exact niche string",
  "secondary_niches": ["exact niche string", "exact niche string"],
  "audience": {
    "who_they_sell_to": "one sentence in plain English",
    "audience_persona_keywords": ["3 to 5 keywords describing the buyer"]
  },
  "content_angles": [
    "short phrase describing a Reel angle that would resonate",
    "short phrase describing a Reel angle that would resonate",
    "short phrase describing a Reel angle that would resonate"
  ],
  "business_type": "B2B" or "B2C" or "B2B2C",
  "confidence": 0.0 to 1.0,
  "explanation": "One sentence telling the user how you interpreted their input. Plain English. No jargon. No em dashes.",
  "clarifying_question": null or "one short question if confidence is below 0.6"
}

RULES:
1. If the user's input is shorter than 8 words or genuinely ambiguous, set confidence below 0.6 and write a clarifying_question. Otherwise clarifying_question must be null.
2. secondary_niches must be different from primary_niche and from each other. Return an empty array only if no second niche is genuinely relevant.
3. Never invent niches. If nothing fits, return primary_niche "Business & Entrepreneurship" with confidence 0.3 and a clarifying_question.
4. Do not use em dashes anywhere in your output.
5. Do not return any text outside the JSON object. No preamble. No code fences. No commentary.
6. The explanation field is the only thing the user will read directly, so write it for a non-technical creator, not for a developer.`;

function buildUserPrompt(input: NicheRoutingInput): string {
  return `Business description from user:
"""
${input.businessDescription}
"""

Return the JSON now.`;
}

export async function routeNiche(
  input: NicheRoutingInput,
): Promise<NicheRoutingOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(input),
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block found in Claude response");
  }

  const raw = textBlock.text.trim();

  let parsed: NicheRoutingOutput;
  try {
    parsed = JSON.parse(raw) as NicheRoutingOutput;
  } catch (err) {
    throw new Error(
      `Failed to parse niche routing JSON. Raw output: ${raw.slice(0, 500)}`,
    );
  }

  return parsed;
}
