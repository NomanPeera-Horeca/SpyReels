/**
 * Side-by-side script comparison: SpyReels structure vs H.E.I.T. structure.
 * Run: pnpm exec tsx scripts/compare-spyreels-vs-heit.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { invokeLLM } from "../server/_core/llm";
import { withAiFormattingRules } from "../server/utils/aiFormattingRules";

const TEST_IDEAS = [
  "The one belief shift that finally made my offer start selling",
  "3 mistakes I made growing my fitness page to 50k",
  "This guy built a $1.8B business with only AI and no team members",
];

const NICHE = "Business & Entrepreneurship";
const TONE = "engaging";
const GOAL_BRIEF = `Creator goal, BALANCED REEL: Strong hook in the first 3 seconds, ONE memorable payoff, conversational contractions, rhythmic pacing with micro-beats every ~10-14 seconds, CTA matched to the topic. No fake stats or filler "bro science."`;

const SPYREELS_WRITER_RULES = `You are SpyReels' script engine. SpyReels analyses thousands of viral Instagram Reels to extract the exact patterns that stop the scroll.
SPYREELS SCRIPT STANDARDS:
- Start with the hook IMMEDIATELY. No "Hey guys", no setup, no intro.
- Write for spoken delivery: short paragraphs (1-2 sentences), natural contractions.
- No labels, bullets, or stage directions unless the creator would literally say them.
- 150-300 spoken words (30-60 seconds). One clear takeaway. One CTA at the end.
- Sound like a real creator, not an AI assistant summarising a topic.
${GOAL_BRIEF}`;

const HEIT_WRITER_RULES = `You are SpyReels' script engine using the H.E.I.T. viral framework.
H.E.I.T. SCRIPT STANDARDS (follow this order in one flowing spoken script):
- H (Hook): First line only. Use ONE of: context (what they will learn), contrarian (belief most disagree with), or intrigue (impossible-sounding fact).
- E (Explain): Name a pain they already feel, then show it is worse or deeper than they thought. Create tension.
- I (Illustrate): Use a metaphor, analogy, or short story with specific detail so they think "that is exactly me."
- T (Teach): ONE simple action or belief shift. Not 3 tips, not 5 hacks. One thing they can do on the next Reel.
- Optional final line: soft CTA (save, comment, follow) tied to the one lesson.
Rules:
- 150-300 spoken words. Spoken delivery. No section labels in the script.
- No "Hey guys". No em dashes.
${GOAL_BRIEF}`;

async function spyreelsStructure(idea: string) {
  const response = await invokeLLM({
    model: "claude-haiku-4-5-20251001",
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a senior short-form script architect at SpyReels. Always respond with valid JSON only."
        ),
      },
      {
        role: "user",
        content: `Create a viral Reel structure for: "${idea}"
Niche: ${NICHE}
Tone: ${TONE}
${GOAL_BRIEF}

Return JSON with:
- hook: { type, text, technique }
- body: { pacing, structure, keyPoints (array of 3-5 strings) }
- transition: { type, text }
- cta: { type, text }
- suggestedTitle
- hookRationale`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "viral_idea_structure",
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
              properties: { type: { type: "string" }, text: { type: "string" } },
              required: ["type", "text"],
              additionalProperties: false,
            },
            cta: {
              type: "object",
              properties: { type: { type: "string" }, text: { type: "string" } },
              required: ["type", "text"],
              additionalProperties: false,
            },
            suggestedTitle: { type: "string" },
            hookRationale: { type: "string" },
          },
          required: ["hook", "body", "transition", "cta", "suggestedTitle", "hookRationale"],
          additionalProperties: false,
        },
      },
    },
  });
  return parseJson(String(response.choices[0]?.message?.content || "{}"));
}

async function heitStructure(idea: string) {
  const response = await invokeLLM({
    model: "claude-haiku-4-5-20251001",
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a H.E.I.T. script architect. Always respond with valid JSON only."
        ),
      },
      {
        role: "user",
        content: `Create a H.E.I.T. Reel structure for: "${idea}"
Niche: ${NICHE}
Tone: ${TONE}
${GOAL_BRIEF}

H = Hook (context OR contrarian OR intrigue)
E = Explain (surfacePain they feel, deeperProblem that makes it worse)
I = Illustrate (analogyOrStory with relatableDetail)
T = Teach (singleAction: ONE lesson only, not a list)

Return JSON:
- hook: { heitType: "context"|"contrarian"|"intrigue", text, technique }
- explain: { surfacePain, deeperProblem }
- illustrate: { analogyOrStory, relatableDetail }
- teach: { singleAction, closingLine }
- suggestedTitle`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "heit_structure",
        strict: true,
        schema: {
          type: "object",
          properties: {
            hook: {
              type: "object",
              properties: {
                heitType: { type: "string", enum: ["context", "contrarian", "intrigue"] },
                text: { type: "string" },
                technique: { type: "string" },
              },
              required: ["heitType", "text", "technique"],
              additionalProperties: false,
            },
            explain: {
              type: "object",
              properties: {
                surfacePain: { type: "string" },
                deeperProblem: { type: "string" },
              },
              required: ["surfacePain", "deeperProblem"],
              additionalProperties: false,
            },
            illustrate: {
              type: "object",
              properties: {
                analogyOrStory: { type: "string" },
                relatableDetail: { type: "string" },
              },
              required: ["analogyOrStory", "relatableDetail"],
              additionalProperties: false,
            },
            teach: {
              type: "object",
              properties: {
                singleAction: { type: "string" },
                closingLine: { type: "string" },
              },
              required: ["singleAction", "closingLine"],
              additionalProperties: false,
            },
            suggestedTitle: { type: "string" },
          },
          required: ["hook", "explain", "illustrate", "teach", "suggestedTitle"],
          additionalProperties: false,
        },
      },
    },
  });
  return parseJson(String(response.choices[0]?.message?.content || "{}"));
}

async function writeScript(
  idea: string,
  structure: Record<string, unknown>,
  writerRules: string,
  frameworkLabel: string
) {
  const response = await invokeLLM({
    model: "claude-haiku-4-5-20251001",
    messages: [
      { role: "system", content: withAiFormattingRules(writerRules) },
      {
        role: "user",
        content: `Write the complete Reel script (${frameworkLabel}).
Topic: "${idea}"
Niche: ${NICHE}
Tone: ${TONE}

STRUCTURE PLAN (follow in order):
${JSON.stringify(structure, null, 2)}

Requirements:
- 150-300 spoken words
- Do NOT include labels like Hook: or Body:
- First line must be the hook
- Return ONLY the script text`,
      },
    ],
  });
  return String(response.choices[0]?.message?.content || "").trim();
}

async function scoreViralProbability(
  idea: string,
  spyreelsScript: string,
  heitScript: string
) {
  const response = await invokeLLM({
    model: "claude-haiku-4-5-20251001",
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(`You are an Instagram Reels viral potential judge. Compare two scripts for the SAME idea. Score each 1-10 on:
- hookStrength (first 2 seconds)
- retentionTension (do they need to keep watching?)
- memorability (illustration / story stickiness)
- singlePayoffClarity (one clear takeaway vs scattered tips)
- spokenNaturalness

Then pick a winner for viral probability on Instagram Reels and explain in 2-3 sentences. JSON only.`),
      },
      {
        role: "user",
        content: `IDEA: "${idea}"

SCRIPT A (SpyReels structure):
${spyreelsScript}

SCRIPT B (H.E.I.T. structure):
${heitScript}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "comparison_verdict",
        strict: true,
        schema: {
          type: "object",
          properties: {
            spyreels: {
              type: "object",
              properties: {
                hookStrength: { type: "number" },
                retentionTension: { type: "number" },
                memorability: { type: "number" },
                singlePayoffClarity: { type: "number" },
                spokenNaturalness: { type: "number" },
                overallViralScore: { type: "number" },
              },
              required: [
                "hookStrength",
                "retentionTension",
                "memorability",
                "singlePayoffClarity",
                "spokenNaturalness",
                "overallViralScore",
              ],
              additionalProperties: false,
            },
            heit: {
              type: "object",
              properties: {
                hookStrength: { type: "number" },
                retentionTension: { type: "number" },
                memorability: { type: "number" },
                singlePayoffClarity: { type: "number" },
                spokenNaturalness: { type: "number" },
                overallViralScore: { type: "number" },
              },
              required: [
                "hookStrength",
                "retentionTension",
                "memorability",
                "singlePayoffClarity",
                "spokenNaturalness",
                "overallViralScore",
              ],
              additionalProperties: false,
            },
            winner: { type: "string", enum: ["spyreels", "heit", "tie"] },
            reasoning: { type: "string" },
          },
          required: ["spyreels", "heit", "winner", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });
  return parseJson(String(response.choices[0]?.message?.content || "{}"));
}

function parseJson(raw: string): Record<string, unknown> {
  return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const results: Array<Record<string, unknown>> = [];

  for (let i = 0; i < TEST_IDEAS.length; i++) {
    const idea = TEST_IDEAS[i];
    console.log(`\n[${i + 1}/3] Generating: ${idea.slice(0, 60)}...`);

    const spyStruct = await spyreelsStructure(idea);
    await sleep(3000);
    const heitStruct = await heitStructure(idea);
    await sleep(3000);

    const spyScript = await writeScript(idea, spyStruct, SPYREELS_WRITER_RULES, "SpyReels");
    await sleep(3000);
    const heitScript = await writeScript(idea, heitStruct, HEIT_WRITER_RULES, "H.E.I.T.");
    await sleep(3000);

    const verdict = await scoreViralProbability(idea, spyScript, heitScript);

    results.push({
      idea,
      spyreels: {
        structure: spyStruct,
        script: spyScript,
        wordCount: wordCount(spyScript),
        scores: (verdict as any).spyreels,
      },
      heit: {
        structure: heitStruct,
        script: heitScript,
        wordCount: wordCount(heitScript),
        scores: (verdict as any).heit,
      },
      verdict,
    });

    console.log(`  Winner: ${(verdict as any).winner} (SpyReels ${(verdict as any).spyreels?.overallViralScore}/10 vs HEIT ${(verdict as any).heit?.overallViralScore}/10)`);
  }

  const outPath = "scripts/spyreels-vs-heit-comparison.json";
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved full comparison to ${outPath}`);

  const spyWins = results.filter((r) => (r.verdict as any).winner === "spyreels").length;
  const heitWins = results.filter((r) => (r.verdict as any).winner === "heit").length;
  const ties = results.filter((r) => (r.verdict as any).winner === "tie").length;
  console.log(`\nSummary: SpyReels ${spyWins} | H.E.I.T. ${heitWins} | Tie ${ties}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
