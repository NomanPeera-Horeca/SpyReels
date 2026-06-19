import Anthropic from "@anthropic-ai/sdk";
import type {
  NicheRoutingInput,
  NicheRoutingOutput,
} from "../types";
import { NICHES } from "../types";

const SYSTEM_PROMPT = `You are SpyReels' niche routing engine. A user has described their business in their own words. Your job is to map their description to the niches in our curated viral Reels library so we can show them creators whose content patterns will help them grow.

CRITICAL DISTINCTION: Map to where the user's BUYERS pay attention on Instagram, not to the literal industry the user operates in. A B2B restaurant equipment seller does not need food creators. However, a restaurant OWNER creating content to attract diners IS a B2C creator. Their audience is guests, not other restaurant owners. A B2B equipment seller needs business creators that restaurant owners follow. A wedding photographer does not need photography creators. They need wedding and lifestyle creators that brides follow.

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
1. AMBIGUITY CHECK. Before answering, verify the user's description gives you THREE pieces of information: (a) what topic or area they create about, work in, or sell, (b) who their audience or buyer is, and (c) a specific angle, sub-niche, geography, or distinguishing detail. If ANY of these three is missing or vague, set confidence below 0.6 AND write a clarifying_question that asks for the missing piece. The clarifying_question must be a single short question, not a list. Examples of ambiguous inputs that MUST trigger clarification: "I help people make money on Instagram" (missing: how, and who specifically), "I am a coach" (missing: coach for what, and for whom), "I sell stuff online" (missing: what stuff, to whom), "I help women" (missing: help with what), "I run an agency" (missing: agency for what service, serving whom), "Fashion" (missing: who, what, and what kind), "Crochet" (missing: who, what they sell). Do NOT demand information about monetization model, revenue, or business stage. If the topic, audience, and a specific angle are present, confidence should be at or above 0.6 even if the user has not stated whether they sell a course versus coaching versus products. When confidence is at or above 0.6, clarifying_question must be null.
2. secondary_niches must be different from primary_niche and from each other. Only include a secondary niche if your buyer's attention genuinely overlaps with that niche on Instagram. Return fewer than 2 secondary niches, including an empty array, if no second niche is genuinely relevant. Do not pad the list.
3. STRICT NICHE TAXONOMY. The primary_niche and every entry in secondary_niches MUST come from the exact list of available niches provided above. Never invent, paraphrase, abbreviate, or combine niche names. For example, do not return "Art & Design" because that is not in the list, even if you think the user fits there. If nothing in the list fits, return primary_niche "Business & Entrepreneurship" with confidence 0.3 and a clarifying_question. If you are tempted to write a niche name that does not appear in the available list verbatim, that is a rule violation and you must pick a real niche from the list instead.
4b. HOSPITALITY / FOOD / VENUE CREATOR RULE. If the user describes a physical location they own or operate (hotel, restaurant, cafe, bar, salon, gym, spa, studio), they are a B2C creator making content to attract CUSTOMERS / GUESTS, not a B2B seller. Do NOT apply the B2B buyer attention rule to these. Map them to the niche that matches their location type: hotel/resort → "Travel & Hotels" or "Lifestyle", restaurant/cafe/bar → "Restaurants & Cafes" or "Food & Cooking", gym/fitness studio → "Health & Fitness". The audience persona should describe their CUSTOMERS (guests, diners, travelers, members) not their business peers.
4. B2B BUYER ATTENTION RULE. If the user sells to other BUSINESSES (B2B), the primary niche must reflect where the BUSINESS BUYER pays attention on Instagram, not where the end consumer of the product pays attention. For example, a manufacturer selling makeup brushes wholesale to beauty brand owners has buyers who pay attention to entrepreneurship, e-commerce, and brand-building content, not to consumer beauty content. A SaaS for dentists has buyers (practice owners) who pay attention to business and practice growth content, not to consumer dental content. A company selling restaurant equipment to operators has buyers who pay attention to restaurant operations and small business content, not to food or recipe content. When in doubt for a B2B case, default primary_niche to "Business & Entrepreneurship" and reserve the consumer-side niche for secondary if relevant at all.
5. Do not use em dashes anywhere in your output.
6. Do not return any text outside the JSON object. No preamble. No code fences. No commentary.
7. The explanation field is the only thing the user will read directly, so write it for a non-technical creator, not for a developer.`;

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
