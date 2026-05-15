/** Append to system prompts for all user-facing LLM generation. */
export const AI_FORMATTING_RULES = `FORMATTING RULES:
- Never use em dashes (U+2014) or en dashes (U+2013) anywhere in output
- Use commas, periods, or parentheses instead
- Em dashes mark text as AI-generated and harm credibility
- This rule is non-negotiable`;

export function withAiFormattingRules(systemPrompt: string): string {
  const base = systemPrompt.trim();
  if (base.includes("This rule is non-negotiable")) return base;
  return `${base}\n\n${AI_FORMATTING_RULES}`;
}
