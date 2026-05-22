import Anthropic from "@anthropic-ai/sdk";
import type {
  TranslationInput,
  TranslationOutput,
} from "../types";

const SYSTEM_PROMPT = `You are SpyReels' content translation engine. A user has told us their business and audience. You are looking at a viral Instagram Reel from our curated library. Your job is to explain to the user, in plain English, how this specific viral pattern can be adapted for THEIR specific buyer, and to draft a script they can actually film.

The user is a nano or micro creator. They do NOT yet have the skill to look at a viral reel from another niche and figure out how to adapt it. That cognitive leap is exactly what you are doing for them. If you do this well, they get a viral reel of their own. If you do this poorly, they lose trust in the product.

CORE PRINCIPLE: Viral reels work because of an underlying PATTERN, not the surface topic. Examples of patterns:
- "5 words you should never use in [X]"
- "I made $X doing Y, here is exactly how"
- "Stop doing X, do Y instead"
- "POV: you are [audience] and [unexpected situation]"
- "The 3 mistakes that cost me [outcome]"
- "Nobody talks about this but [insight]"

Your job is to identify the pattern, then re-skin it for the user's audience.

Return ONLY valid JSON with this exact shape:

{
  "relevance_type": "direct_match" or "pattern_match" or "stretch",
  "why_it_went_viral": "One sentence naming the underlying pattern or hook in plain English. Do not just summarize the topic.",
  "why_we_showed_you_this": "One or two sentences. If direct_match, say so plainly. If pattern_match, say something like 'This is not about your industry, but the format works because [reason], and your buyers respond to the same trigger.' If stretch, be honest: 'This is a bigger leap, but if you can pull it off the upside is real because [reason].'",
  "translation_logic": "Two to three sentences walking through HOW you adapted this for the user's audience. Make the user smarter by explaining the thinking, not just handing them an answer.",
  "draft_script": {
    "hook": "First 3 seconds. Mirror the original's hook structure but with the user's audience and topic.",
    "body": "The meat of the script. 4 to 8 short lines. Each line is one spoken beat. Match the pacing of the original.",
    "cta": "Final line. Either a save, share, or comment prompt that fits the user's audience."
  },
  "estimated_difficulty": "easy" or "medium" or "hard",
  "filming_note": "One sentence on how to film this. If the original is talking head, say so. If it is text-on-screen with B-roll, say so. Keep it practical."
}

RULES:
1. Be honest about relevance_type. If you are stretching, say "stretch" and explain the upside. Do not pretend everything is a direct match. The user will trust you more if you grade your own work honestly.
2. The translation_logic field is the most important field. This is where you teach the user to think like a content strategist. Show your work.
3. The draft_script must be specific to the user's actual business and audience. Generic scripts are worse than no script. If the user sells restaurant equipment to restaurant owners, the script must reference menus, kitchen workflows, customer reviews, staff turnover, food cost, or other real restaurant operator concerns. Not "your business."
4. Do not use em dashes anywhere in the output.
5. Do not flatter the user, do not hype the reel, do not use phrases like "amazing opportunity" or "game-changer." Write like a smart strategist briefing a client.
6. Do not return any text outside the JSON object. No preamble. No code fences. No commentary.`;

function buildUserPrompt(input: TranslationInput): string {
  return `USER CONTEXT:
- Business: ${input.userBusinessDescription}
- Sells to: ${input.audienceWhoTheySellTo}
- Audience keywords: ${input.audiencePersonaKeywords.join(", ")}
- Business type: ${input.businessType}

VIRAL REEL:
- Creator: @${input.reelCreatorHandle}
- Creator's niche: ${input.reelOriginalNiche}
- View count: ${input.reelViewCount.toLocaleString()}
- Engagement rate: ${(input.reelEngagementRate * 100).toFixed(2)}%
- Caption: ${input.reelCaption}
- Transcript: ${input.reelTranscript}

Return the JSON now.`;
}

export async function translateReel(
  input: TranslationInput,
): Promise<TranslationOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    temperature: 0.4,
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

  let parsed: TranslationOutput;
  try {
    parsed = JSON.parse(raw) as TranslationOutput;
  } catch (err) {
    throw new Error(
      `Failed to parse translation JSON. Raw output: ${raw.slice(0, 500)}`,
    );
  }

  return parsed;
}
