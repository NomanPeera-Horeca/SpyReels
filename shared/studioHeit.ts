// Prompts from BrandScript AI export (30-Day Plan + AI Coach). Do not change JSON shapes.

export function buildStudioDateContext(now = new Date()): string {
  const year = now.getFullYear();
  const formatted = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Current date: ${formatted}. Frame titles, trends, costs, and stats for ${year}. Never use outdated years like ${year - 2} unless the idea is explicitly about the past.`;
}

export const COACH_SYSTEM_PROMPT = `You are a world-class personal branding coach and viral content strategist. You help creators turn raw ideas into high-performing social media content.

You think like a top creator, a film director, and a marketing strategist. The FIRST thing you do with any idea is identify the CONTENT FORMAT — because the format determines everything.

━━━ CONTENT FORMATS ━━━

1. TALKING HEAD — Creator speaks directly to camera. Script voice: Direct, conversational, first-person.
2. VOICEOVER + B-ROLL — Narration plays while camera shows the creator's world. Script voice: narration describing what the viewer is SEEING.
3. BEHIND THE SCENES — Creator shows workspace/process. Script voice: Insider reveal tone.
4. TUTORIAL / DEMO — Creator physically demonstrates something. Script voice: Step narration.
5. TRENDING AUDIO / POV — Built around a trending sound. Script voice: POV framing.
6. FACELESS / TEXT-ONLY — No face needed. Bold text over background footage.

━━━ THE HEIT FRAMEWORK ━━━
- H (Hook): Stop the scroll in 2 seconds. MAX 2 sentences. ZERO warm-up. Pick ONE:
  • Context: specific outcome promise
  • Contrarian: bold claim most people disagree with
  • Intrigue: drop a cryptic fact with NO explanation
- E (Explain): Name the problem. Show it's bigger than they think. Build tension.
- I (Illustrate): Story, metaphor, or analogy. Specific details. Make them see themselves.
- T (Teach): ONE simple action or takeaway. Not 5 tips — one thing.

Critical rules:
- Never sound like AI. Sound like a real person talking to a friend.
- Scripts must be specific to the creator's niche, not generic.`;

/** When the creator gives an explicit angle, topic, or Spark note with specific intent. */
export const COACH_EXPLICIT_ANGLE_RULES = `Explicit angle mode:
- The raw idea or attached plan/spark note defines WHAT the video is about. Niche and audience define WHO it is for and HOW to speak.
- If the idea names a product, SaaS, app, tool, or brand (examples: SpyReels, their own software), serve that marketing or product-story goal.
- If the creator says not to name the tool on camera, use problem-first or curiosity content without the brand name.
- Meta instructions (for example "for SpyReels", "promo for my tool") are ground truth even when the niche profile points elsewhere.
- The explicit angle wins over default niche assumptions and over any source reel subject.`;

/** When no explicit angle: niche, audience, Reddit/Quora research, and plan context pick the topic. */
export const COACH_DEFAULT_TOPIC_RULES = `Default topic mode (no explicit creator angle):
- Choose WHAT the video is about from niche, target audience, brand description, and the Reddit/Quora/web research block when provided.
- Ground hooks and problems in real audience pains and questions from research. Cite the platform or thread tone when relevant.
- When a 30-day plan card is attached, its title, angle, hook, funnel stage (TOFU/MOFU/BOFU), and researchSignal are ground truth for this script.
- TOFU may use broader pains (content, marketing, growth) even for a niche audience. MOFU and BOFU go deeper. Rotate sub-topics so the feed does not repeat one theme.
- Scripts must be specific to the creator's world, not generic advice.`;

/** @deprecated Use COACH_EXPLICIT_ANGLE_RULES or COACH_DEFAULT_TOPIC_RULES via buildCoachPrompt options. */
export const COACH_TOPIC_INTENT_RULES = `${COACH_EXPLICIT_ANGLE_RULES}\n\n${COACH_DEFAULT_TOPIC_RULES}`;

export function buildAnalysisPrompt(
  description: string,
  niche: string,
  targetAudience: string,
  brandDescription?: string | null
): string {
  return `You are a smart content strategist. Analyze this raw idea BEFORE writing any script.

${buildStudioDateContext()}

Creator profile:
- Niche: ${niche}
- Target Audience: ${targetAudience}
${brandDescription ? `- About their brand: ${brandDescription}` : ""}

Raw idea: "${description}"

Identify gaps, ambiguous references, or missing context that would cause wrong assumptions.

${COACH_EXPLICIT_ANGLE_RULES}

If the idea mentions a product, tool, or brand but you would otherwise default to generic niche content, lower confidence and ask one sharp clarifying question about the intended angle.

CRITICAL: Do NOT flag personal claims the creator makes about themselves. Only flag external claims (news stories, brand announcements, viral rumors, third-party stats).

Return ONLY valid JSON:
{
  "confidence": <integer 0-100>,
  "understood": "<1-2 sentences on what you understood>",
  "gaps": ["<gap>"],
  "questions": ["<One sharp question>", "<Second only if truly needed>"],
  "factCheck": {
    "hasClaim": <true only for external claims — brand news, viral rumors, third-party stats>,
    "status": "<verified | likely_true | unverified | viral_rumor | likely_false | satire>",
    "claimSummary": "<1 sentence or null>",
    "warning": "<warning for viral_rumor/likely_false/satire, else null>",
    "safeAngle": "<safer framing suggestion, else null>"
  }
}

Rules: If confidence >= 85 and no real gaps: return questions: []. Max 2 questions. Return ONLY valid JSON.`;
}

export function buildCoachPrompt(
  description: string,
  niche: string,
  targetAudience: string,
  brandDescription?: string | null,
  clarifications?: Array<{ question: string; answer: string }>,
  audienceResearchBlock?: string,
  options?: { explicitUserAngle?: boolean }
): string {
  const clarificationBlock =
    clarifications && clarifications.length > 0
      ? `\n\nAdditional context (treat as ground truth):\n${clarifications.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")}`
      : "";
  const audienceBlock = audienceResearchBlock?.trim()
    ? `\n\n${audienceResearchBlock.trim()}`
    : "";

  const topicRules = options?.explicitUserAngle
    ? COACH_EXPLICIT_ANGLE_RULES
    : COACH_DEFAULT_TOPIC_RULES;

  return `A content creator just shared this raw idea:

"${description}"${clarificationBlock}${audienceBlock}

${buildStudioDateContext()}

Creator profile:
- Niche: ${niche}
- Target Audience: ${targetAudience}
${brandDescription ? `- About their brand: ${brandDescription}` : ""}

${topicRules}

Produce a full HEIT script with production directions. Return ONLY valid JSON:
{
  "contentType": "testimonial | hot-take | story | behind-the-scenes | transformation | educational | trend | rant | announcement",
  "contentFormat": "talking-head | voiceover-broll | behind-the-scenes | tutorial-demo | trending-audio | faceless",
  "formatLabel": "Human-readable label e.g. 'Talking Head', 'Day-in-the-Life'",
  "platform": "instagram | tiktok | both",
  "estimatedDuration": "e.g. 30-45 seconds",
  "productionCoach": {
    "device": "iPhone | Android | GoPro",
    "cameraSettings": "2-3 sentences specific to format and device",
    "setup": "One sentence: exactly where to position camera for this format",
    "musicMix": "One sentence: exact volume and when to duck or fade (e.g. 8-12% under voice, mute during hook)",
    "instagramAudio": [
      {
        "title": "Exact track name as shown in Instagram Reels audio library",
        "artist": "Artist or original sound creator name",
        "searchHint": "Exact phrase the creator should paste into Instagram Reels audio search",
        "matchReason": "One sentence: why this trending audio fits THIS script tone and niche",
        "isTrending": true
      },
      {
        "title": "Backup track name",
        "artist": "Artist name",
        "searchHint": "Backup search phrase",
        "matchReason": "One sentence: when to use this instead",
        "isTrending": false
      }
    ],
    "music": "Legacy one-line summary only if needed; prefer instagramAudio picks above",
    "voiceTone": "Delivery style and emotion for this format",
    "bRoll": [
      { "shot": "What to film", "example": "Where to find it or how to film it", "canUseStock": true }
    ],
    "textOverlay": "Specific text overlay for hook moment — what words, when, style"
  },
  "title": "Short catchy working title",
  "tone": "conversational | emotional | energetic | calm | authoritative | humorous",
  "hook": "H section only. MAX 2 sentences. Zero warm-up. Written in the FORMAT's voice.",
  "explain": "E section only. Name the problem. Show it is bigger than they think. Build tension. Do not solve yet.",
  "illustrate": "I section only. One story, analogy, or example with concrete detail.",
  "teach": "T section only. ONE clear takeaway or action. Not a list. Do not repeat the call to action.",
  "cta": "Final call to action only. Tell them exactly what to do next (comment, DM, save, follow). Must be different from teach. 1-2 sentences."
}

Music rules for productionCoach.instagramAudio:
- Give exactly 2 picks: one primary (isTrending: true) and one backup.
- Use real songs or original sounds that are commonly found in Instagram Reels audio search for this niche in ${new Date().getFullYear()}. Include the exact searchHint string.
- Match audio energy to the script (calm educational vs hype vs emotional story). No vague advice like "use trending audio."
- talking-head scripts: low-volume background tracks. trending-audio format: the sound IS the hook, say so in musicMix.`;
}

/** Turn pasted rough drafts into the same HEIT + productionNotes JSON as net-new coach scripts. */
export function buildConvertRoughScriptPrompt(
  roughScript: string,
  niche: string,
  targetAudience: string,
  brandDescription?: string | null,
  workingTitle?: string | null
): string {
  const titleHint = workingTitle?.trim()
    ? `Working title hint: "${workingTitle.trim()}"\n\n`
    : "";
  const wrapped = `${titleHint}CONVERT THIS ROUGH DRAFT into a structured HEIT production script. Keep the creator's core message, facts, and voice. Fill gaps only where the draft is incomplete. Do not invent new claims.

--- Rough draft ---
${roughScript.trim()}
--- End draft ---`;

  return buildCoachPrompt(wrapped, niche, targetAudience, brandDescription);
}

export function buildPlanGenerationPrompt(
  niche: string,
  targetAudience: string,
  goal: string,
  platforms: string[],
  brandDescription?: string | null,
  options?: { startDay?: number; endDay?: number; audienceResearchBlock?: string }
): string {
  const startDay = options?.startDay ?? 1;
  const endDay = options?.endDay ?? 30;
  const cardCount = endDay - startDay + 1;
  const isFullPlan = startDay === 1 && endDay === 30;

  const goalDescriptions: Record<string, string> = {
    grow: "Maximize reach and follower count — prioritize TOFU content",
    viral: "Land one big breakout video — use bold contrarian hooks",
    authority: "Become the go-to expert — mix TOFU education with MOFU case studies",
    monetize: "Convert followers into paying clients — balance MOFU trust + BOFU offers",
  };

  const scopeLine = isFullPlan
    ? "Generate exactly 30 content idea cards — one per day."
    : `Generate exactly ${cardCount} content idea cards for days ${startDay} through ${endDay} (part of a 30-day plan).`;

  return `You are a viral content strategist generating a 30-day content plan.

${buildStudioDateContext()}

Creator profile:
- Niche: ${niche}
- Target Audience: ${targetAudience}
- Platforms: ${platforms.join(", ")}
- Goal: ${goal} — ${goalDescriptions[goal] ?? goal}
${brandDescription ? `- Brand: ${brandDescription}` : ""}

${scopeLine} Each card is a specific, actionable content idea grounded in real audience questions when provided below.
${options?.audienceResearchBlock ?? ""}
Distribution rules:
- TOFU (awareness): ~50% — hooks that get shared by non-followers
- MOFU (trust): ~35% — builds credibility with existing audience
- BOFU (conversion): ~15% — drives action or inquiry
- Vary content formats — no more than 3 consecutive same format in this batch
- Platforms: rotate across ${platforms.join(" and ")} — assign the best platform per idea
- Use day numbers ${startDay} through ${endDay} exactly once each

Return a JSON object with a "cards" array of exactly ${cardCount} items:
{
  "cards": [
  {
    "day": ${startDay},
    "funnelStage": "tofu | mofu | bofu",
    "contentFormat": "talking-head | voiceover-broll | behind-the-scenes | tutorial-demo | trending-audio | faceless",
    "platform": "${platforms[0] ?? "instagram"} | ${platforms[1] ?? "tiktok"} | all",
    "title": "Specific, compelling title for this idea",
    "hook": "The exact opening line ready to record — no warm-up",
    "angle": "1-2 sentences on the HEIT angle — what problem, what illustration, what takeaway",
    "filmingLocation": "Specific location e.g. 'At your desk, front camera' or 'In the kitchen, showing prep'",
    "researchSignal": "1 sentence on why this topic works — cite a real audience question or thread from the research block when possible (e.g. 'Based on r/fitness discussion about...')"
  }
  ]
}

Return ONLY valid JSON. Be extremely specific to the niche — zero generic advice.`;
}

export function buildPlanRegeneratePrompt(
  niche: string,
  targetAudience: string,
  goal: string,
  cards: Array<{ day: number; title: string; angle: string; funnelStage: string; contentFormat: string; platform: string }>,
  feedback: string
): string {
  return `You are regenerating ${cards.length} content plan card(s) based on creator feedback.

${buildStudioDateContext()}

Creator profile:
- Niche: ${niche}
- Target Audience: ${targetAudience}
- Goal: ${goal}

Cards to regenerate:
${cards.map((c) => `Day ${c.day}: "${c.title}" (${c.funnelStage}, ${c.contentFormat}, ${c.platform})\nAngle: ${c.angle}`).join("\n\n")}

Creator feedback: "${feedback}"

Generate ${cards.length} replacement card(s) that address this feedback. Keep the same day numbers and funnel stage unless feedback explicitly asks to change them.

Return a JSON object with a "cards" array of ${cards.length} replacement item(s):
{ "cards": [{ "day", "funnelStage", "contentFormat", "platform", "title", "hook", "angle", "filmingLocation", "researchSignal" }] }

Return ONLY valid JSON.`;
}

export function buildHookVariationsPrompt(
  hook: string,
  body: string,
  callToAction: string,
  niche: string,
  targetAudience: string
): string {
  return `Generate 3 alternative hook variations for this script.

Current hook: "${hook}"
Script body (for context): "${body.slice(0, 300)}..."
CTA: "${callToAction}"
Niche: ${niche}
Audience: ${targetAudience}

Write 3 hooks using different HEIT hook types. Each max 2 sentences.

Return ONLY valid JSON:
{
  "context": "Context hook — specific outcome promise",
  "contrarian": "Contrarian hook — bold claim most disagree with",
  "intrigue": "Intrigue hook — cryptic fact with no explanation"
}`;
}

export const STUDIO_PREFILL_KEY = "studio_prefill";
