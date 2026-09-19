import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { AI_FACT_CLAIM_GUARDRAIL } from "@shared/aiFactClaimGuardrail";
import {
  RECREATE_DEFAULT_TOPIC_RULES,
  RECREATE_EXPLICIT_ANGLE_RULES,
} from "@shared/recreateAnglePrompt";
import { analyzeRemakeReadability } from "./remakeReadability";
import {
  formatFactRisksForRepair,
  validateRemakeFactRisk,
} from "./remakeFactRisk";
import { analyzeRemakeStructure } from "./remakeStructure";
import { remakeCopyRisk } from "./remakeOriginality";

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
  return tactics.map((t) => String(t).split("_").join(" ")).join(", ");
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
- The creator provided their own angle. Use ONLY hook pattern and retention tactics from the source Reel.
- Do NOT reuse the source Reel's niche, subject matter, examples, named entities, or vocabulary unless the creator explicitly asks for them.
- Transfer STRUCTURE and ENGAGEMENT MECHANICS, not the literal topic.
- Use the same hook pattern type adapted to the creator's angle.
- Replicate the retention mechanics without copying the factual story.`
    : `**APPLY THIS WHEN WRITING:**
- Use the source Reel for hook pattern, pacing, retention mechanics, transition style, and CTA style.
- Transfer STRUCTURE, not literal wording.
- Let the approved creator/audience context choose the new subject.`;

  return `
**PRE-ANALYZED SOURCE REEL CONTEXT:**
${lines.join("\n")}

${applyBlock}
`;
}

function buildDeliveryCuesPromptSection(): string {
  return `
**DELIVERY CUES:** Add performance/delivery cues in square brackets throughout the script. Use concise cues such as [PAUSE], [LEAN IN], [SPEED UP], [SLOW DOWN], [EMPHASIZE], [LOOK AT CAMERA], [GESTURE], [SMILE], [SERIOUS FACE], [COUNT ON FINGERS], [SHAKE HEAD], or [NOD].
Place a cue at the start of the line it applies to. Do not overuse them.`;
}


function buildFormatFidelityRules(
  viralStructure: Record<string, unknown>
): string {
  const body = (viralStructure.body ?? {}) as Record<string, unknown>;
  const hook = (viralStructure.hook ?? {}) as Record<string, unknown>;
  const structure = String(body.structure ?? "");
  const pacing = String(body.pacing ?? "");
  const hookType = String(hook.type ?? "");
  const tone = String(viralStructure.overallTone ?? "");
  const combined = `${structure} ${pacing} ${hookType} ${tone}`.toLowerCase();

  const rules = [
    "- Preserve the source Reel's presentation format, not just its topic and pacing.",
    "- Do not convert an interaction-led or scene-led Reel into a generic talking-head explanation.",
    "- Keep the opening energy level and curiosity mechanism at least as strong as the source.",
    "- Every spoken line should sound natural for the source format: dialogue should sound like dialogue, narration like narration, Q&A like Q&A.",
  ];

  if (
    /multi-clip|compilation|dialogue|conversation|workplace|candid|scene|prank/.test(
      combined
    )
  ) {
    rules.push(
      "- This source is interaction/scene driven. Build multiple short candid beats or dialogue clips that escalate toward a payoff.",
      "- Keep editorial explanation out of the body unless the source uses it. Let the scenes carry the meaning.",
      "- If explanation is needed, put it in the caption/CTA rather than breaking the scene format."
    );
  }

  if (/q&a|question|interview/.test(combined)) {
    rules.push(
      "- Preserve the question/answer or interview rhythm. Do not rewrite it as a monologue."
    );
  }

  if (/pov/.test(combined)) {
    rules.push(
      "- Preserve the POV framing and experiential perspective. Do not turn it into detached advice."
    );
  }

  if (/list|steps|tips|countdown/.test(combined)) {
    rules.push(
      "- Preserve the list/count structure and momentum. Do not flatten it into one long explanation."
    );
  }

  return `**FORMAT FIDELITY:**\\n${rules.join("\\n")}`;
}

function groundingRules(block: string, isSameTopic: boolean): string {
  if (!block.trim()) {
    return isSameTopic
      ? `**FACT GROUNDING:** The source transcript/caption may be used for facts about the original topic. Do not add new named people, businesses, dates, quotes, studies, revenue figures, wait times, percentages, or historical claims that are not present in the source. Generic or clearly hypothetical examples are allowed.`
      : `**FACT GROUNDING:** No external research was available. Do not invent named people, businesses, dates, quotes, studies, revenue figures, wait times, percentages, or historical claims. Use generic or clearly hypothetical examples instead. ${AI_FACT_CLAIM_GUARDRAIL}`;
  }

  return `**VERIFIED RESEARCH GROUNDING:**
Use the research below only as factual support. You may paraphrase supported facts, but do not expand snippets into stronger claims than they contain.
${block}

**FACT RULES:**
- Any real person, company, restaurant, institution, date, quote, study, statistic, money figure, percentage, or performance number must be explicitly supported by the verified research${isSameTopic ? " or the source transcript/caption" : ""}.
- If a useful example is not supported, make it generic or clearly hypothetical.
- Never invent a founder story or named case study merely to imitate the source Reel's narrative shape.
- Vague-but-honest beats precise-but-invented.
${AI_FACT_CLAIM_GUARDRAIL}`;
}


async function repairCopiedSameTopic(input: {
  sourceTranscript: string;
  script: string;
  viralStructure: Record<string, unknown>;
  scriptFormatClosing: string;
  llmInvoker: typeof invokeLLM;
}): Promise<string> {
  const response = await input.llmInvoker({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are an originality editor for viral short-form scripts. Preserve topic and proven mechanics, but rebuild copied content into a genuinely new creative execution. Return only the rewritten spoken script."
        ),
      },
      {
        role: "user",
        content: `The script below keeps the correct topic but is too close to the source.

SOURCE TRANSCRIPT
<<<${input.sourceTranscript}>>>

CURRENT REMAKE
<<<${input.script}>>>

VIRAL STRUCTURE
${JSON.stringify(input.viralStructure, null, 2)}

REBUILD RULES
- Keep the SAME topic and core message.
- Keep the hook TYPE, pacing energy, transition mechanic, and CTA style.
- Do NOT preserve the source scene-by-scene order.
- Do NOT preserve nonessential supporting people, jokes, anecdotes, scene details, or punchlines.
- Do NOT synonym-swap source sentences.
- Reframe the story with a fresh opening, fresh sequence, and fresh wording.
- Subject-critical factual anchors may remain when they define the topic, but surrounding creative execution must be new.
- Never copy a long phrase from the source.
- The result should feel like a different creator independently making a Reel on the same topic.

${input.scriptFormatClosing}`,
      },
    ],
    maxTokens: 3000,
  });

  return String(response.choices[0]?.message?.content ?? "").trim();
}

async function repairUnsupportedFacts(input: {
  script: string;
  risksText: string;
  trustedGrounding: string;
  scriptFormatClosing: string;
  llmInvoker: typeof invokeLLM;
}): Promise<string> {
  const response = await input.llmInvoker({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a factual-integrity editor for short-form scripts. Remove unsupported specificity without weakening the hook or pacing. Never add replacement facts. Return only the repaired spoken script."
        ),
      },
      {
        role: "user",
        content: `Repair this script so every factual real-world claim is supported.

UNSUPPORTED OR RISKY CLAIMS
${input.risksText}

TRUSTED GROUNDING
${input.trustedGrounding || "(none — use generic or clearly hypothetical examples)"}

CURRENT SCRIPT
${input.script}

RULES
- Remove or generalize every unsupported named entity, date, quote, study, statistic, money figure, performance number, or historical claim.
- Do not invent a replacement person, company, restaurant, event, number, or quote.
- Preserve the viral structure, hook pattern, pacing, and core lesson.
- A hypothetical example must be explicitly generic, not presented as a true story.
- Do not add citations or structural labels to the spoken script.

${input.scriptFormatClosing}`,
      },
    ],
    maxTokens: 3000,
  });

  return String(response.choices[0]?.message?.content ?? "").trim();
}

export type GeneratedRemakeContent = {
  viralStructure: Record<string, unknown>;
  generatedScript: string;
  readabilityAnalysis: Record<string, unknown>;
  structureCacheHit: boolean;
  factIntegrity: {
    repaired: boolean;
    initialRiskCount: number;
  };
};

export async function generateRemakeContent(input: {
  originalTranscript: string;
  caption: string;
  reel?: any;
  sourceKey?: string;
  topic: string;
  gradeLevel: string;
  addCues: boolean;
  researchGroundingBlock?: string;
  trustedResearchTexts?: string[];
  platformLabel?: "Instagram Reel" | "TikTok video" | "YouTube Short";
  viralStructureOverride?: Record<string, unknown>;
  llmInvoker?: typeof invokeLLM;
}): Promise<GeneratedRemakeContent> {
  const platformLabel = input.platformLabel ?? "Instagram Reel";
  const runLlm = input.llmInvoker ?? invokeLLM;
  const analyzed = input.viralStructureOverride
    ? { structure: input.viralStructureOverride, cacheHit: true }
    : await analyzeRemakeStructure({
        originalTranscript: input.originalTranscript,
        caption: input.caption,
        sourceKey: input.sourceKey,
        platformLabel,
        llmInvoker: runLlm,
      });
  const viralStructure = analyzed.structure;

  const gradeLevelInstruction =
    input.gradeLevel === "auto"
      ? "Choose the most appropriate grade level between Grade 2 and Grade 6 for spoken short-form content."
      : `Write at a Grade ${input.gradeLevel} reading level with simple vocabulary and short spoken sentences.`;

  const isSameTopic = input.topic === "SAME_TOPIC";
  const v13Context = buildV13ContextBlock(input.reel, {
    explicitUserAngle: !isSameTopic,
  });
  const cuesInstruction = input.addCues
    ? buildDeliveryCuesPromptSection()
    : "";
  const scriptFormatClosing = input.addCues
    ? `Write natural spoken text with short paragraphs. Add concise [DELIVERY CUES] only where useful. Do not include labels like "Hook:" or "Body:".`
    : `Write natural spoken text with short paragraphs. Do not add stage directions or structural labels.`;

  const researchGroundingBlock = input.researchGroundingBlock?.trim() ?? "";
  const factsBlock = groundingRules(researchGroundingBlock, isSameTopic);
  const formatFidelityBlock = buildFormatFidelityRules(viralStructure);

  const scriptPrompt = isSameTopic
    ? `You are an expert ${platformLabel} scriptwriter. Rewrite the following viral ${platformLabel} script on the SAME TOPIC and core message, but make it fresh and original.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}
${v13Context}

**ORIGINAL VIRAL TRANSCRIPT:**
${input.originalTranscript}

${factsBlock}

${formatFidelityBlock}

**READABILITY:**
${gradeLevelInstruction}
${cuesInstruction}

**INSTRUCTIONS:**
1. Keep the same topic and core message.
2. Use the same hook pattern type ("${(viralStructure.hook as any)?.type || "Bold Statement"}") but rephrase it.
3. Cover the same core points without copying sentences.
4. Preserve pacing style ("${(viralStructure.body as any)?.pacing || "Problem-solution"}"), transition technique, and CTA style.
5. Keep similar duration and spoken rhythm.
6. Do not swap in a different invented real-world example.

${scriptFormatClosing}`
    : `You are an expert ${platformLabel} scriptwriter. Use the proven viral STRUCTURE below to write a NEW script for the creator's requested direction.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}
${v13Context}

**SOURCE TRANSCRIPT — STRUCTURE AND PACING REFERENCE ONLY, NOT A FACT SOURCE FOR THE NEW TOPIC:**
${input.originalTranscript}

**CREATOR DIRECTION:**
${input.topic}

${hasExplicitUserAngleInTopic(input.topic) ? RECREATE_EXPLICIT_ANGLE_RULES : RECREATE_DEFAULT_TOPIC_RULES}

${factsBlock}

${formatFidelityBlock}

**READABILITY:**
${gradeLevelInstruction}
${cuesInstruction}

**INSTRUCTIONS:**
1. Use the same hook pattern type ("${(viralStructure.hook as any)?.type || "Bold Statement"}") adapted to the new direction.
2. Follow the same pacing style ("${(viralStructure.body as any)?.pacing || "Problem-solution"}") and information flow.
3. Preserve the transition and CTA mechanics while making the message relevant to the creator.
4. Keep similar length and spoken rhythm.
5. Research supports facts; the source Reel supports structure. Never reverse those roles.
6. If research does not support a concrete story, use a generic or clearly hypothetical example rather than inventing one.

${scriptFormatClosing}`;

  const writerStarted = Date.now();
  const scriptResponse = await runLlm({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          `You are an expert ${platformLabel} scriptwriter. Write natural, spoken scripts that preserve proven viral mechanics and factual integrity.`
        ),
      },
      { role: "user", content: scriptPrompt },
    ],
    maxTokens: 3200,
  });

  let generatedScript = String(
    scriptResponse.choices[0]?.message?.content || ""
  ).trim();

  console.info("[RemakeLatency] writer_ms", Date.now() - writerStarted, {
    sourceKey: input.sourceKey ?? null,
  });

  const trustedTexts = [
    input.topic,
    researchGroundingBlock,
    ...(input.trustedResearchTexts ?? []),
    ...(isSameTopic ? [input.originalTranscript, input.caption] : []),
  ];

  const initialRisk = validateRemakeFactRisk({
    script: generatedScript,
    trustedTexts,
  });

  let repaired = false;
  if (!initialRisk.safe) {
    const repairStarted = Date.now();
    const repairedScript = await repairUnsupportedFacts({
      script: generatedScript,
      risksText: formatFactRisksForRepair(initialRisk.risks),
      trustedGrounding: trustedTexts.filter(Boolean).join("\n\n"),
      scriptFormatClosing,
      llmInvoker: runLlm,
    });

    const repairedRisk = validateRemakeFactRisk({
      script: repairedScript,
      trustedTexts,
    });

    console.info("[RemakeLatency] fact_repair_ms", Date.now() - repairStarted, {
      initialRiskCount: initialRisk.risks.length,
      remainingRiskCount: repairedRisk.risks.length,
    });

    if (!repairedScript || !repairedRisk.safe) {
      throw new Error(
        "SpyReels could not produce a safely grounded remake. Please try again."
      );
    }

    generatedScript = repairedScript;
    repaired = true;
  }

  if (isSameTopic) {
    const initialCopyRisk = remakeCopyRisk({
      source: input.originalTranscript,
      remake: generatedScript,
    });

    if (!initialCopyRisk.safe) {
      const originalityStarted = Date.now();
      const rebuilt = await repairCopiedSameTopic({
        sourceTranscript: input.originalTranscript,
        script: generatedScript,
        viralStructure,
        scriptFormatClosing,
        llmInvoker: runLlm,
      });

      const rebuiltRisk = remakeCopyRisk({
        source: input.originalTranscript,
        remake: rebuilt,
      });

      console.info(
        "[RemakeLatency] originality_repair_ms",
        Date.now() - originalityStarted,
        {
          initialLongestRunWords: initialCopyRisk.longestRunWords,
          remainingLongestRunWords: rebuiltRisk.longestRunWords,
        }
      );

      if (!rebuilt || !rebuiltRisk.safe) {
        throw new Error(
          "SpyReels could not produce a sufficiently original same-topic remake. Please try again."
        );
      }

      generatedScript = rebuilt;
    }
  }

  const readabilityAnalysis = analyzeRemakeReadability(generatedScript);

  return {
    viralStructure,
    generatedScript,
    readabilityAnalysis,
    structureCacheHit: analyzed.cacheHit,
    factIntegrity: {
      repaired,
      initialRiskCount: initialRisk.risks.length,
    },
  };
}
