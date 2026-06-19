import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "./utils/sanitizeAiOutput";
import {
  assignTagToScript,
  ensureDefaultTags,
  getOnboardingState,
  getScriptIdeaById,
  getScriptTagsByWorkspace,
  updateSavedScript,
  updateScriptIdea,
} from "./db";

/** Next weekday ~2 days out, 9:00 AM local server time */
export function pickAutoPostSchedule(): { postDate: Date; postTime: string } {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(9, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return { postDate: d, postTime: "09:00" };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse free-text calendar hints like "Thursday", "March 12", or "next Friday" */
export function parseCalendarHint(hint: string | undefined): { postDate: Date; postTime: string } {
  const trimmed = hint?.trim();
  if (!trimmed) return pickAutoPostSchedule();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T09:00:00`);
    if (!Number.isNaN(d.getTime()) && d >= startOfToday()) {
      return { postDate: d, postTime: "09:00" };
    }
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedMs)) {
    const d = new Date(parsedMs);
    d.setHours(9, 0, 0, 0);
    if (d >= startOfToday()) {
      return { postDate: d, postTime: "09:00" };
    }
  }

  const lower = trimmed.toLowerCase();
  const wantsNext = lower.includes("next");

  for (let offset = wantsNext ? 1 : 0; offset <= 21; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(9, 0, 0, 0);
    const longDay = d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const shortDay = longDay.slice(0, 3);
    if (lower.includes(longDay) || lower.includes(shortDay)) {
      return { postDate: d, postTime: "09:00" };
    }
  }

  return pickAutoPostSchedule();
}

export function defaultCalendarHint(): string {
  const { postDate } = pickAutoPostSchedule();
  return postDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatPlannedPostLabel(postDate: Date, postTime: string): string {
  const day = postDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const [h, m] = postTime.split(":").map(Number);
  const hour = h ?? 9;
  const minute = m ?? 0;
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  const minPart = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
  return `${day} at ${h12}${minPart} ${period}`;
}

export function buildSaveAssistantMessage(plannedLabel: string | null): string {
  if (!plannedLabel) {
    return "Script saved. I added it to My Scripts, tagged it Scripting. I'm writing your caption and hashtags in the background so they're ready when you open the editor.";
  }
  return `Script saved. I added it to My Scripts, tagged it Scripting, and scheduled it for ${plannedLabel}. I'm writing your caption and hashtags in the background so they're ready when you open the editor.`;
}

function buildUrgentFallbackFollowUps(ideaText: string): string[] {
  const hook = ideaText.split("\n")[0]?.trim().slice(0, 60) || "this idea";
  return [
    `Write a 30-second version with a punchier hook that stops scrollers on "${hook}"`,
    `Turn this into Part 2 with the fixes or next steps viewers will save right away`,
    `Give me 3 alternate opening hooks I can film and A/B test on this same topic today`,
  ];
}

export async function generateIdeaFollowUps(
  ideaText: string,
  script: string,
  title?: string | null,
  profileContext?: string | null
): Promise<string[]> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          `You write follow-up prompts for SpyReels Idea to Script, like Perplexity's "Keep exploring" chips.
Each tap starts a NEW script (uses credits). Your job: make the creator hungry to click immediately.

Return valid JSON with exactly 3 followUps. Each follow-up must:
- Be one full sentence, 10-18 words, written as what the CREATOR would type next
- Start with a strong verb: Write, Turn, Give me, Create, Draft, Rewrite, Build, Show me
- Feel urgent and specific to THIS script (reference the topic, hook, or angle when possible)
- Lead to a new filmable script: sequel, shorter cut, hook variants, different emotion, CTA spin-off, or "Part 2"
- Sound like the obvious next move after reading this script, not generic coaching

Do NOT write: vague advice, "consider improving", questions with no action, or anything over 20 words.
No bullet prefixes. No em dashes.`
        ),
      },
      {
        role: "user",
        content: `Original idea: ${ideaText.slice(0, 500)}
Script title: ${title || "Untitled"}
Script excerpt:
${script.slice(0, 1200)}
${profileContext ? `\nCreator profile:\n${profileContext}` : ""}

Return JSON: { "followUps": ["...", "...", "..."] }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "idea_follow_ups",
        strict: true,
        schema: {
          type: "object",
          properties: {
            followUps: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 3,
            },
          },
          required: ["followUps"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (typeof raw !== "string") return buildUrgentFallbackFollowUps(ideaText);
  try {
    const parsed = sanitizeAiOutputDeep(JSON.parse(raw)) as { followUps?: string[] };
    const items = (parsed.followUps ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    return items.length >= 3 ? items : buildUrgentFallbackFollowUps(ideaText);
  } catch {
    return buildUrgentFallbackFollowUps(ideaText);
  }
}

export async function generateCaptionForScriptContent(content: string): Promise<{
  caption: string;
  hashtags: string[];
}> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          `You write Instagram Reel captions. Return JSON only with caption (string) and hashtags (array of 5 strings without #). Hook line must be 7-10 words.`
        ),
      },
      {
        role: "user",
        content: `Write a caption and 5 hashtags for this Reel script:\n\n${content.slice(0, 2000)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "idea_script_caption",
        strict: true,
        schema: {
          type: "object",
          properties: {
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 },
          },
          required: ["caption", "hashtags"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("Empty caption response");
  const parsed = sanitizeAiOutputDeep(JSON.parse(raw)) as { caption: string; hashtags: string[] };
  return {
    caption: parsed.caption.trim(),
    hashtags: parsed.hashtags.slice(0, 5).map((h) => h.replace(/^#/, "")),
  };
}

export async function enrichIdeaSavedScriptInBackground(
  savedScriptId: number,
  content: string
): Promise<void> {
  try {
    const { caption, hashtags } = await generateCaptionForScriptContent(content);
    await updateSavedScript(savedScriptId, {
      generatedCaption: caption,
      generatedHashtags: JSON.stringify(hashtags),
      captionStyle: "educational",
    } as any);
  } catch (err) {
    console.error(`[Ideas] Caption enrichment failed for script ${savedScriptId}:`, err);
  }
}

export function mergeIdeaMetaPatch(
  existing: unknown,
  metaPatch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const prevMeta =
    base.ideaMeta && typeof base.ideaMeta === "object"
      ? (base.ideaMeta as Record<string, unknown>)
      : {};
  return { ...base, ideaMeta: { ...prevMeta, ...metaPatch } };
}

export async function generateAndStoreFollowUps(ideaId: number): Promise<string[]> {
  const idea = await getScriptIdeaById(ideaId);
  if (!idea?.generatedScript?.trim()) return [];

  const profile = await getOnboardingState(idea.userId);
  const profileContext = [
    profile?.businessDescription?.trim()
      ? `Business: ${profile.businessDescription.trim()}`
      : null,
    profile?.targetAudience?.trim() ? `Audience: ${profile.targetAudience.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const followUps = await generateIdeaFollowUps(
    idea.idea,
    idea.generatedScript,
    idea.generatedTitle,
    profileContext || null
  );
  if (followUps.length === 0) return [];

  const viralStructure = mergeIdeaMetaPatch(idea.viralStructure, { followUps });
  await updateScriptIdea(ideaId, { viralStructure: viralStructure as any });
  return followUps;
}

export async function assignScriptingTag(
  savedScriptId: number,
  workspaceId: string,
  userId: number
): Promise<void> {
  await ensureDefaultTags(workspaceId, userId);
  const tags = await getScriptTagsByWorkspace(workspaceId);
  const scripting = tags.find((t) => t.name === "Scripting");
  if (scripting) {
    await assignTagToScript(savedScriptId, scripting.id);
  }
}
