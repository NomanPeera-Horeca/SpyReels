import type { ContentAgentAction } from "./contentAgentTools";

/**
 * Continue the exact creator-level tool that asked for more information.
 *
 * A short reply such as "Friday at 10" must not go back through general
 * intent routing after schedule_filming asked for a date. The same principle
 * applies when Remake is waiting for a public source URL.
 */
export function continueContentAgentAction(
  action: ContentAgentAction,
  reply: string
): ContentAgentAction {
  const value = reply.trim();

  if (action.tool === "schedule_filming") {
    const previous = action.scheduleText?.trim();
    const scheduleText = previous
      ? `${previous} ${value}`.trim()
      : value;
    return {
      ...action,
      scheduleText,
      confidence: 100,
      source: "rule",
    };
  }

  if (action.tool === "remake_social_video") {
    return {
      ...action,
      sourceUrl: value,
      confidence: 100,
      source: "rule",
    };
  }

  if (action.tool === "refine_script") {
    return {
      ...action,
      refineInstruction: value,
      confidence: 100,
      source: "rule",
    };
  }

  return {
    ...action,
    confidence: 100,
    source: "rule",
  };
}
