import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";
import { AI_FACT_CLAIM_GUARDRAIL } from "@shared/aiFactClaimGuardrail";
import {
  RECREATE_DEFAULT_TOPIC_RULES,
  RECREATE_EXPLICIT_ANGLE_RULES,
} from "@shared/recreateAnglePrompt";

function formatNiche(niche: string | null): string | null {
  if (!niche) return null;
  return niche
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatHookPattern(hook: string | null): string | null {
  if (!hook) return null;
  return hook
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatRetentionTactics(tactics: unknown): string | null {
  if (!Array.isArray(tactics) || tactics.length === 0) return null;
  return tactics
    .map((t) => String(t).split("_").join(" "))
    .join(", ");
}

function hasExplicitUserAngleInTopic(topic: string): boolean {
  return (
    topic.includes("Creator's chosen angle") ||
    topic.includes("Creator goal (ground truth")
  );
}

function buildV13ContextBlock(
  reel: any,
  options?: { explicitUserAngle?: boolean }
): string {
  const lines: string[] = [];
  const {
    niche: rawNiche = null,
    hookPattern: rawHookPattern = null,
    retentionTactics: rawRetentionTactics = null,
    contentType: rawContentType = null,
    classificationReason: rawClassificationReason = null,
    viralFlag = false,
  } = reel ?? {};

  const niche = formatNiche(rawNiche ? String(rawNiche) : null);
  const hookPattern = formatHookPattern(
    rawHookPattern ? String(rawHookPattern) : null
  );
  const retentionTactics = formatRetentionTactics(rawRetentionTactics);
  const contentType = rawContentType ? String(rawContentType) : null;
  const classificationReason = rawClassificationReason
    ? String(rawClassificationReason)
    : null;
  const isViral = viralFlag === 1 || viralFlag === true;

  if (niche) lines.push(`- Niche: ${niche}`);
  if (contentType) lines.push(`- Content type: ${contentType}`);
  if (hookPattern) lines.push(`- Hook pattern used: ${hookPattern}`);
  if (retentionTactics) {
    lines.push(`- Retention tactics used: ${retentionTactics}`);
  }
  if (isViral) {
    lines.push(
      "- Performance: VIRAL (top performer for this creator's recent posts)"
    );
  }
  if (classificationReason) {
    lines.push(`- Editor's analysis: ${classificationReason}`);
  }

  if (lines.length === 0) return "";

  const applyBlock = options?.explicitUserAngle
    ? `**APPLY THIS WHEN WRITING:**
- The creator provided their own angle. Use ONLY hook pattern and retention tactics from the source reel. Do NOT reuse the source reel's niche, content type, subject matter, or vocabulary.
- Transfer STRUCTURE and ENGAGEMENT MECHANICS, not the literal topic from the classifier or transcript.
- The hook pattern above is the structural opening that helped this reel succeed. Use the SAME pattern type adapted to the creator's angle.
- The retention tactics above are the mechanics that kept viewers watching. Replicate them in the new script.`
    : `**APPLY THIS WHEN WRITING:**
- The hook pattern above is the structural opening that helped this reel succeed. Use the SAME pattern type adapted to the new topic.
- The retention tactics above are the mechanics that kept viewers watching. Replicate them in the new script.
- The content type and niche guide the tone and vocabulary.
- Transfer the STRUCTURE, not the literal words. The new script is on a different topic but uses the same engagement mechanics.`;

  return `
**PRE-ANALYZED SOURCE REEL CONTEXT (from our classifier):**
${lines.join("\n")}

${applyBlock}

`;
}

function buildDeliveryCuesPromptSection(): string {
  return `
**DELIVERY CUES:** Add performance/delivery cues in square brackets throughout the script to guide the speaker on HOW to deliver each line. Use cues like:
- [PAUSE]
- [LEAN IN]
- [SPEED UP]
- [SLOW DOWN]
- [WHISPER]
- [EMPHASIZE]
- [LOOK AT CAMERA]
- [GESTURE]
- [RAISE VOICE]
- [SMILE]
- [SERIOUS FACE]
- [COUNT ON FINGERS]
- [SHAKE HEAD]
- [NOD]

Place cues at the START of the line they apply to. Every 2-3 lines should have a cue. The cues should create a dynamic, engaging delivery that keeps viewer attention throughout.`;
}

export type GeneratedRemakeContent = {
  viralStructure: Record<string, unknown>;
  generatedScript: string;
  readabilityAnalysis: Record<string, unknown>;
};

export async function generateRemakeContent(input: {
  originalTranscript: string;
  caption: string;
  reel?: any;
  topic: string;
  gradeLevel: string;
  addCues: boolean;
  platformLabel?: "Instagram Reel" | "TikTok video" | "YouTube Short";
}): Promise<GeneratedRemakeContent> {
  const platformLabel = input.platformLabel ?? "Instagram Reel";
  const structurePrompt = `You are an expert viral content analyst specializing in ${platformLabel} scripts.

Analyze the following viral ${platformLabel} transcript and identify its exact structure. Return a JSON object with these fields:

{
  "hook": {
    "type": "string",
    "text": "string",
    "technique": "string"
  },
  "body": {
    "pacing": "string",
    "structure": "string",
    "keyPoints": ["array of the main points made"]
  },
  "transition": {
    "type": "string",
    "text": "string"
  },
  "cta": {
    "type": "string",
    "text": "string"
  },
  "overallTone": "string",
  "estimatedPace": "string"
}

**Caption:** ${input.caption}

**Full Transcript:**
${input.originalTranscript}

Return ONLY valid JSON, no markdown formatting.`;

  const structureResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a viral content structure analyst. Always respond with valid JSON only."
        ),
      },
      { role: "user", content: structurePrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "viral_structure",
        strict: true,
        schema: {
          type: "object",
          properties: {
            hook: {
              type: "object",
              properties: {
                type: { type: "string" },
                text: { type: "string" },
                technique: { type: "string" },
              },
              required: ["type", "text", "technique"],
              additionalProperties: false,
            },
            body: {
              type: "object",
              properties: {
                pacing: { type: "string" },
                structure: { type: "string" },
                keyPoints: { type: "array", items: { type: "string" } },
              },
              required: ["pacing", "structure", "keyPoints"],
              additionalProperties: false,
            },
            transition: {
              type: "object",
              properties: {
                type: { type: "string" },
                text: { type: "string" },
              },
              required: ["type", "text"],
              additionalProperties: false,
            },
            cta: {
              type: "object",
              properties: {
                type: { type: "string" },
                text: { type: "string" },
              },
              required: ["type", "text"],
              additionalProperties: false,
            },
            overallTone: { type: "string" },
            estimatedPace: { type: "string" },
          },
          required: [
            "hook",
            "body",
            "transition",
            "cta",
            "overallTone",
            "estimatedPace",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  let viralStructure: Record<string, unknown>;
  try {
    viralStructure = sanitizeAiOutputDeep(
      JSON.parse(
        (String(structureResponse.choices[0].message.content) || "{}")
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim()
      )
    );
  } catch {
    viralStructure = { error: "Failed to parse structure" };
  }

  const gradeLevelInstruction =
    input.gradeLevel === "auto"
      ? "Choose the most appropriate grade level (between Grade 2-6) based on the topic and audience."
      : `Write at a Grade ${input.gradeLevel} reading level. Use simple vocabulary and short sentences appropriate for that grade level.`;

  const isSameTopic = input.topic === "SAME_TOPIC";
  const v13Context = buildV13ContextBlock(input.reel, {
    explicitUserAngle: !isSameTopic,
  });
  const cuesInstruction = input.addCues
    ? buildDeliveryCuesPromptSection()
    : "";
  const scriptFormatClosing = input.addCues
    ? `Write the script as natural spoken text. Add delivery cues in [BRACKETS] throughout using the cue types above. Place each cue at the START of the line it applies to. Every 2-3 spoken lines should include a cue.
Use short paragraphs for natural pauses.
Do NOT include structural labels like "Hook:" or "Body:"; write one flowing speaking script with inline [CUES] only.`
    : `Write the script as spoken text (no stage directions, no [brackets]). Write it exactly as it should be spoken aloud.
Use short paragraphs to indicate natural pauses.
Do NOT include any labels like "Hook:" or "Body:". Write one flowing script.`;

  const scriptPrompt = isSameTopic
    ? `You are an expert ${platformLabel} scriptwriter. Rewrite the following viral ${platformLabel} script keeping the EXACT SAME TOPIC and core message, but make it sound fresh and original, not a copy.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}
${v13Context}

**ORIGINAL VIRAL TRANSCRIPT:**
${input.originalTranscript}

**READABILITY REQUIREMENT:**
${gradeLevelInstruction}${cuesInstruction}

**INSTRUCTIONS:**
1. Keep the SAME topic and core message as the original.
2. HOOK: Use the SAME hook pattern type ("${(viralStructure.hook as any)?.type || "Bold Statement"}") with the same core idea, but rephrase it.
3. BODY: Cover the SAME key points and arguments but rephrase them. Change examples, analogies, or supporting details. New examples must stay generic or hypothetical; do not swap in a different invented real-entity fact, study, or named-source claim. ${AI_FACT_CLAIM_GUARDRAIL} Keep the same pacing style ("${(viralStructure.body as any)?.pacing || "Problem-solution"}") and information flow.
4. TRANSITION: Use a similar transition technique ("${(viralStructure.transition as any)?.type || "pivot"}") but word it differently.
5. CTA: End with a similar call-to-action style ("${(viralStructure.cta as any)?.type || "engagement"}") but phrase it in your own words.
6. Match the overall tone: "${(viralStructure as any)?.overallTone || "engaging"}"
7. Keep similar length and pacing to the original.
8. The result should feel like a different person making the same argument: same topic, same structure, but different wording throughout.
9. Do NOT just swap synonyms. Genuinely rephrase and restructure sentences while keeping the meaning.

${scriptFormatClosing}`
    : `You are an expert ${platformLabel} scriptwriter. Using the EXACT viral structure from a proven viral ${platformLabel}, write a NEW script on a different topic.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}
${v13Context}

**ORIGINAL VIRAL TRANSCRIPT (for reference of style and pacing):**
${input.originalTranscript}

**NEW TOPIC/ANGLE:**
${input.topic}

${hasExplicitUserAngleInTopic(input.topic) ? RECREATE_EXPLICIT_ANGLE_RULES : RECREATE_DEFAULT_TOPIC_RULES}

**READABILITY REQUIREMENT:**
${gradeLevelInstruction}${cuesInstruction}

**INSTRUCTIONS:**
1. HOOK: Use the SAME hook pattern type ("${(viralStructure.hook as any)?.type || "Bold Statement"}") but adapted to the new topic.
2. BODY: Follow the SAME pacing style ("${(viralStructure.body as any)?.pacing || "Problem-solution"}") and information structure. Match the number of key points.
3. TRANSITION: Use a similar transition technique ("${(viralStructure.transition as any)?.type || "pivot"}") adapted to the new topic.
4. CTA: End with a similar call-to-action style ("${(viralStructure.cta as any)?.type || "engagement"}") but relevant to the new topic.
5. Match the overall tone: "${(viralStructure as any)?.overallTone || "engaging"}"
6. Keep similar length and pacing to the original.

${scriptFormatClosing}`;

  const scriptResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          `You are an expert ${platformLabel} scriptwriter. Write natural, spoken scripts that match viral patterns.`
        ),
      },
      { role: "user", content: scriptPrompt },
    ],
  });

  const generatedScript = String(
    scriptResponse.choices[0].message.content || ""
  );

  const hemingwayPrompt = `You are a readability analysis engine modeled after the Hemingway Editor. Analyze the following script and return a JSON response.

**SCRIPT:**
${generatedScript}

**TARGET GRADE LEVEL:** ${input.gradeLevel === "auto" ? "Auto-detect appropriate level" : `Grade ${input.gradeLevel}`}

Return a JSON object with:
{
  "gradeLevel": number,
  "readingEase": number,
  "wordCount": number,
  "sentenceCount": number,
  "avgWordsPerSentence": number,
  "issues": [
    {
      "type": "passive_voice" | "complex_sentence" | "adverb" | "hard_to_read" | "very_hard_to_read",
      "text": "the exact problematic text",
      "suggestion": "brief suggestion for improvement"
    }
  ],
  "passiveVoiceCount": number,
  "adverbCount": number,
  "hardSentenceCount": number,
  "veryHardSentenceCount": number,
  "overallAssessment": "string"
}

Return ONLY valid JSON.`;

  const hemingwayResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a readability analysis engine. Always respond with valid JSON only."
        ),
      },
      { role: "user", content: hemingwayPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "readability_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            gradeLevel: { type: "number" },
            readingEase: { type: "number" },
            wordCount: { type: "number" },
            sentenceCount: { type: "number" },
            avgWordsPerSentence: { type: "number" },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                  suggestion: { type: "string" },
                },
                required: ["type", "text", "suggestion"],
                additionalProperties: false,
              },
            },
            passiveVoiceCount: { type: "number" },
            adverbCount: { type: "number" },
            hardSentenceCount: { type: "number" },
            veryHardSentenceCount: { type: "number" },
            overallAssessment: { type: "string" },
          },
          required: [
            "gradeLevel",
            "readingEase",
            "wordCount",
            "sentenceCount",
            "avgWordsPerSentence",
            "issues",
            "passiveVoiceCount",
            "adverbCount",
            "hardSentenceCount",
            "veryHardSentenceCount",
            "overallAssessment",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  let readabilityAnalysis: Record<string, unknown>;
  try {
    readabilityAnalysis = sanitizeAiOutputDeep(
      JSON.parse(
        (String(hemingwayResponse.choices[0].message.content) || "{}")
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim()
      )
    );
  } catch {
    readabilityAnalysis = { error: "Failed to parse readability analysis" };
  }

  return {
    viralStructure,
    generatedScript,
    readabilityAnalysis,
  };
}
