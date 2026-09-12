/** Rules when the creator supplied their own angle (Spark, rewrite angle, custom topic). */
export const RECREATE_EXPLICIT_ANGLE_RULES = `Explicit angle rules:
- When a creator angle is provided, it defines the subject, pain point, and message. Profile niche and audience define WHO you speak to and HOW, not WHAT topic to use instead.
- Do NOT revert to the source reel's subject (for example kitchen equipment, repairs, refrigeration) unless the angle explicitly asks for that.
- The source viral reel supplies structure only: hook pattern, pacing, retention tactics, CTA style. Ignore its literal topic when an angle is given.
- TOFU content may use broader business pains (content, marketing, audience growth) even when the audience is restaurant owners. MOFU and BOFU may go niche-specific. Follow what the angle implies.
- If the angle names a product or tool (for example SpyReels) or says not to name it on camera, follow that meta instruction exactly.`;

/** Alias for prompts that already reference this name. */
export const RECREATE_ANGLE_PRIORITY_RULES = RECREATE_EXPLICIT_ANGLE_RULES;

/** Rules when no custom angle: niche, audience, and Reddit/Quora research pick the topic. */
export const RECREATE_DEFAULT_TOPIC_RULES = `Default topic rules (no custom angle from the creator):
- Choose WHAT the video is about from the creator profile and audience research below (Reddit, Quora, web pains and questions).
- Use the source viral reel ONLY for structure: hook pattern, pacing, retention tactics, CTA style. Do NOT reuse its literal subject.
- Ground the hook and problem in a real audience pain or question from the research block when one fits.
- Rotate sub-topics within the niche so content stays fresh (labor, marketing, margins, content, operations, etc.). Do not default every script to the same theme.
- TOFU-style topics may be broader (content, growth, marketing). MOFU/BOFU may go deeper into niche-specific pains. Match depth to what the research signal suggests.
- Speak TO the target audience using vocabulary from their world.`;

/** Format a user-provided remake/rewrite angle so audience context cannot override the topic. */
export function buildRecreateTopicPrompt(args: {
  angle: string;
  targetAudience?: string | null;
  businessDescription?: string | null;
}): string {
  const angle = args.angle.trim();
  if (angle === "SAME_TOPIC") return "SAME_TOPIC";

  const aud = args.targetAudience?.trim();
  const biz = args.businessDescription?.trim();

  const lines = [
    "Creator's chosen angle (GROUND TRUTH — this defines WHAT the video is about):",
    `"${angle}"`,
  ];

  if (aud) {
    lines.push(
      "",
      `Speak TO this audience (voice, examples, and CTA — do NOT replace the angle topic): ${aud}`
    );
  }
  if (biz) {
    lines.push(`Creator/business context (optional framing only, not a topic override): ${biz}`);
  }

  lines.push("", RECREATE_EXPLICIT_ANGLE_RULES);
  return lines.join("\n");
}

/** When remake has no custom angle: niche + audience + Reddit/Quora research choose the topic. */
export function buildRecreateDefaultTopicPrompt(args: {
  niche: string;
  targetAudience: string;
  businessDescription?: string | null;
  audienceResearchBlock?: string;
}): string {
  const biz = args.businessDescription?.trim();
  const research = args.audienceResearchBlock?.trim() ?? "";

  const lines = [
    "No custom angle from the creator. Choose a specific topic using profile + audience research.",
    "",
    `Niche: ${args.niche}`,
    `Target audience: ${args.targetAudience}`,
  ];

  if (biz) lines.push(`Business/brand context: ${biz}`);
  if (research) lines.push(research);

  lines.push("", RECREATE_DEFAULT_TOPIC_RULES);
  return lines.join("\n");
}
