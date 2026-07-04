import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  buildCoachPrompt,
  buildStudioDateContext,
  COACH_SYSTEM_PROMPT,
} from "@shared/studioHeit";
import {
  buildProductionNotesJson,
  coachScriptIsComplete,
  combineBodyFromSections,
  sectionsFromGenerated,
} from "@shared/coachScriptSections";
import { coachScripts } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { getCreatorCoachProfile, type CreatorCoachProfile } from "./planCoachProfile";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import { getAudienceSignalsByIds, getOrFetchAudienceSignals } from "./audienceResearch/service";
import { checkUsageLimit, incrementUsage } from "./stripe/stripe-service";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { normalizeCoachScriptPayload, parseLlmJson } from "./utils/parseLlmJson";
import { parseCoachScriptSections } from "@shared/coachScriptSections";

export type GeneratedCoachScript = {
  id: number;
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  explain: string;
  illustrate: string;
  teach: string;
  cta: string;
  platform: string;
  tone: string;
  estimatedDuration: string | null;
  contentType: string | null;
  contentFormat: string | null;
  formatLabel: string | null;
  productionNotes: string | null;
};

function mapCoachScriptRow(row: typeof coachScripts.$inferSelect): GeneratedCoachScript {
  const sections = parseCoachScriptSections({
    body: row.body,
    callToAction: row.callToAction,
    productionNotes: row.productionNotes,
  });
  return {
    id: row.id,
    title: row.title,
    hook: row.hook,
    body: row.body,
    callToAction: row.callToAction,
    explain: sections.explain,
    illustrate: sections.illustrate,
    teach: sections.teach,
    cta: sections.cta,
    platform: row.platform,
    tone: row.tone,
    estimatedDuration: row.estimatedDuration,
    contentType: row.contentType,
    contentFormat: row.contentFormat,
    formatLabel: row.formatLabel,
    productionNotes: row.productionNotes,
  };
}

export async function generateCoachScriptForWorkspace(args: {
  userId: number;
  workspaceId: string;
  openId: string;
  description: string;
  clarifications?: Array<{ question: string; answer: string }>;
  planCardId?: number;
  audienceSignalIds?: number[];
  skipUsageCheck?: boolean;
  profileOverride?: CreatorCoachProfile;
  audienceResearchBlock?: string;
  onPhase?: (phase: "hook_angle" | "write_script" | "production_notes") => void;
}): Promise<GeneratedCoachScript> {
  if (!args.skipUsageCheck) {
    const usageCheck = await checkUsageLimit(args.userId, "recreateCount", args.openId);
    if (!usageCheck.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You've reached your monthly AI script limit (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
      });
    }
  }

  const profile = args.profileOverride ?? (await getCreatorCoachProfile(args.userId));
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  let audienceResearchBlock = args.audienceResearchBlock ?? "";
  if (!audienceResearchBlock) {
    const audienceSignalIds = args.audienceSignalIds ?? [];
    if (audienceSignalIds.length > 0) {
      const attachedSignals = await getAudienceSignalsByIds(args.workspaceId, audienceSignalIds);
      audienceResearchBlock = formatAudienceSignalsForPrompt(attachedSignals);
    } else {
      const { signals } = await getOrFetchAudienceSignals({
        workspaceId: args.workspaceId,
        nicheSlug: profile.nicheSlug,
        nicheLabel: profile.niche,
        targetAudience: profile.targetAudience,
      });
      audienceResearchBlock = formatAudienceSignalsForPrompt(signals.slice(0, 5));
    }
  }

  args.onPhase?.("write_script");

  const response = await invokeLLM({
    messages: [
      { role: "system", content: withAiFormattingRules(`${COACH_SYSTEM_PROMPT}\n\n${buildStudioDateContext()}`) },
      {
        role: "user",
        content: buildCoachPrompt(
          args.description,
          profile.niche,
          profile.targetAudience,
          profile.brandDescription,
          args.clarifications,
          audienceResearchBlock
        ),
      },
    ],
    maxTokens: 4096,
    response_format: { type: "json_object" },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  const generated = normalizeCoachScriptPayload(parseLlmJson<Record<string, unknown>>(raw, {}));
  if (!coachScriptIsComplete(generated)) {
    console.warn("[studio.generate] incomplete LLM payload", raw.slice(0, 800));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "AI returned an incomplete script. Please try again.",
    });
  }

  const platformRaw = String(generated.platform ?? "both");
  const platform = ["instagram", "tiktok", "both"].includes(platformRaw) ? platformRaw : "both";

  const sections = sectionsFromGenerated(generated);
  const bodyCombined = combineBodyFromSections(sections);
  const ctaText = sections.cta || sections.teach || String(generated.callToAction ?? "");

  args.onPhase?.("production_notes");

  const coachPayload = buildProductionNotesJson(generated.productionCoach, sections, {
    contentFormat: String(generated.contentFormat ?? "talking-head"),
  });

  const insertResult = await db.insert(coachScripts).values({
    userId: args.userId,
    workspaceId: args.workspaceId,
    planCardId: args.planCardId ?? null,
    title: String(generated.title ?? "Untitled script").slice(0, 256),
    hook: String(generated.hook),
    body: bodyCombined,
    callToAction: ctaText,
    platform,
    tone: String(generated.tone ?? "conversational").slice(0, 64),
    estimatedDuration: generated.estimatedDuration
      ? String(generated.estimatedDuration).slice(0, 64)
      : null,
    contentType: generated.contentType ? String(generated.contentType).slice(0, 64) : null,
    contentFormat: generated.contentFormat ? String(generated.contentFormat).slice(0, 64) : null,
    formatLabel: generated.formatLabel ? String(generated.formatLabel).slice(0, 128) : null,
    productionNotes: coachPayload,
  });

  const scriptId = insertResult[0]?.insertId;
  if (!scriptId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save script" });
  }

  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, scriptId)).limit(1);
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load script" });
  }

  if (!args.skipUsageCheck) {
    await incrementUsage(args.userId, "recreateCount");
  }
  return mapCoachScriptRow(row);
}
