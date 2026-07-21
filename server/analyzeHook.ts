import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";

/** Analyze the hook (first 3 seconds) of a reel */
export async function analyzeHook(
  transcript: string,
  caption: string,
  thumbnailUrl: string,
  segments?: Array<{ start: number; end: number; text: string }>
): Promise<string> {
  let first3sText = "";
  if (segments && segments.length > 0) {
    first3sText = segments
      .filter((segment) => segment.start < 3)
      .map((segment) => segment.text)
      .join(" ")
      .trim();
  }

  const prompt = `You are an expert social media content analyst specializing in Instagram Reels.

Analyze the HOOK of this Instagram Reel (the first 3 seconds that capture attention).

**Caption:** ${caption}

**Full Transcript:** ${transcript}

**Audio in first 3 seconds:** ${first3sText || "No speech detected in first 3 seconds"}

Please provide a concise analysis with these sections:

**Audio Hook:** What is said or heard in the first 3 seconds? Identify the specific words, sounds, or music that grab attention.

**Visual Hook (Inferred):** Based on the caption, transcript context, and thumbnail, what visual elements likely appear in the first 3 seconds?

**Hook Type:** Classify the hook type (e.g., Question, Bold Statement, Pattern Interrupt, Curiosity Gap, Controversy, Story Opening, Tutorial Promise, etc.)

**Effectiveness Score:** Rate 1-10 with brief reasoning.

**Improvement Suggestion:** One specific way to make this hook stronger.

Keep the analysis concise and actionable.`;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            "You are a social media content strategist."
          ),
        },
        { role: "user", content: prompt },
      ],
    });

    return (
      (result.choices[0]?.message?.content as string) ||
      "Analysis unavailable"
    );
  } catch {
    return "Hook analysis failed. Transcript is still available above.";
  }
}
