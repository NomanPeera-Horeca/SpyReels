import Anthropic from "@anthropic-ai/sdk";
import type {
  JudgeInput,
  JudgeOutput,
} from "../types";

const SYSTEM_PROMPT = `You are SpyReels' quality gate. Another AI just generated a viral reel translation and script for a user. Your job is to decide whether this output is GOOD ENOUGH to show the user, or whether it is generic, mismatched, or low quality.

The user paid for the year. If you approve garbage, they refund and leave a bad review. If you reject everything, the user never sees anything. Be honest and rigorous.

EVALUATE ON THESE CRITERIA:
1. Specificity: Does the draft script reference the user's ACTUAL audience and industry by specific concepts, not generic placeholders like "your business" or "your industry"?
2. Authenticity: Would a real person in this industry recognize the language as authentic? Or does it sound like an AI imitating the industry?
3. Translation honesty: If the original reel is genuinely not adaptable for this user, was it correctly graded as a stretch or rejected?
4. Hook quality: Is the hook punchy enough to stop the scroll, or is it weak?
5. Filming feasibility: Could a nano creator actually film this in 30 minutes with a phone?

Return ONLY valid JSON with this exact shape:

{
  "decision": "APPROVE" or "REJECT_REGENERATE" or "REJECT_HIDE",
  "specificity_score": 1 to 5,
  "authenticity_score": 1 to 5,
  "translation_honesty_score": 1 to 5,
  "hook_quality_score": 1 to 5,
  "filming_feasibility_score": 1 to 5,
  "overall_score": 1 to 5,
  "feedback_for_regeneration": "If REJECT_REGENERATE, specific instructions on what to fix. Otherwise null.",
  "user_facing_explanation": "If REJECT_HIDE, one sentence the user could read explaining why this reel was not included. Otherwise null."
}

DECISION RULES:
- APPROVE: overall_score is 4 or higher AND no individual score is below 3.
- REJECT_REGENERATE: overall_score is between 2.5 and 4, OR any individual score is below 3 but the reel CAN be salvaged with a better script. Provide specific regeneration feedback.
- REJECT_HIDE: overall_score is below 2.5, OR the relevance_type is "stretch" but the resulting script is too forced to be useful. The reel cannot be meaningfully adapted for this user. Provide a user-facing explanation.

OUTPUT RULES:
- Do not use em dashes anywhere in your output.
- Do not return any text outside the JSON object. No preamble. No code fences. No commentary.
- Be ruthless. A 3 means "acceptable but mediocre," not "good." A 5 means "I would film this myself."`;

function buildUserPrompt(input: JudgeInput): string {
  return `USER CONTEXT:
- Business: ${input.userBusinessDescription}
- Sells to: ${input.audienceWhoTheySellTo}
- Audience keywords: ${input.audiencePersonaKeywords.join(", ")}

ORIGINAL VIRAL REEL:
- Creator: @${input.reelCreatorHandle}
- Creator's niche: ${input.reelOriginalNiche}
- View count: ${input.reelViewCount.toLocaleString()}
- Caption: ${input.reelCaption}
- Transcript: ${input.reelTranscript}

PROPOSED TRANSLATION:
- Relevance type: ${input.proposedTranslation.relevance_type}
- Why it went viral: ${input.proposedTranslation.why_it_went_viral}
- Why we showed it: ${input.proposedTranslation.why_we_showed_you_this}
- Translation logic: ${input.proposedTranslation.translation_logic}
- Draft script hook: ${input.proposedTranslation.draft_script.hook}
- Draft script body: ${input.proposedTranslation.draft_script.body}
- Draft script CTA: ${input.proposedTranslation.draft_script.cta}
- Estimated difficulty: ${input.proposedTranslation.estimated_difficulty}
- Filming note: ${input.proposedTranslation.filming_note}

Evaluate this translation and return the JSON now.`;
}

export async function judgeTranslation(
  input: JudgeInput,
): Promise<JudgeOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    temperature: 0.1,
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

  let raw = textBlock.text.trim();

  // Defensive: strip markdown code fences if the model wrapped its JSON.
  // The system prompt instructs against this but Haiku occasionally does it.
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  let parsed: JudgeOutput;
  try {
    parsed = JSON.parse(raw) as JudgeOutput;
  } catch (err) {
    throw new Error(
      `Failed to parse judge JSON. Raw output: ${raw.slice(0, 500)}`,
    );
  }

  return parsed;
}
