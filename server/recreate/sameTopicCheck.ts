/**
 * Own-winner remakes (Prism format / Refresh) must stay on the original
 * video's topic. A small yes/no check with the cheap model. Fail-open: an
 * outage never blocks a remake.
 */
import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";

const CHECK_MODEL = "claude-haiku-4-5-20251001";

/** Reads {"sameTopic": boolean}; anything else counts as same (fail-open). Pure. */
export function readSameTopicVerdict(raw: string): boolean {
  const parsed = parseLlmJson<{ sameTopic?: unknown }>(raw, {});
  return parsed.sameTopic === false ? false : true;
}

export async function checkKeepsSourceTopic(source: string, script: string): Promise<boolean> {
  try {
    const response = await invokeLLM({
      model: CHECK_MODEL,
      maxTokens: 30,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Does the NEW script cover the same topic and core idea as the ORIGINAL video? A different format, hook or wording is fine. Return ONLY JSON: {"sameTopic": true|false}.',
        },
        { role: "user", content: `ORIGINAL:\n${source.slice(0, 1800)}\n\nNEW SCRIPT:\n${script.slice(0, 2500)}` },
      ],
    });
    return readSameTopicVerdict(String(response.choices[0]?.message?.content ?? ""));
  } catch (err) {
    console.warn("[remake] same_topic_check_failed", { error: err instanceof Error ? err.message : String(err) });
    return true;
  }
}
