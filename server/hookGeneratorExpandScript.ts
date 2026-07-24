import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { parseProductionNotes, parseCoachScriptSections } from "@shared/coachScriptSections";
import { coachScripts } from "../drizzle/schema";
import { getDb, markOnboardingComplete, updateUserPersonalization } from "./db";
import { routeOnboardingNicheSlugs } from "./onboardingRouteNiche";
import {
  generateCoachScriptForWorkspace,
  type GeneratedCoachScript,
} from "./studioGenerateScript";

function buildDescriptionFromHook(args: {
  reelContent: string;
  hook: string;
  onScreenText: string;
}): string {
  return [
    "Write a full Instagram Reel script based on this content idea:",
    args.reelContent.trim(),
    "",
    "CRITICAL: Use this EXACT hook as the opening line (frame 0, spoken on camera):",
    `"${args.hook.trim()}"`,
    "",
    `On-screen text for frame 0 (first 0.5 sec, separate from spoken hook): "${args.onScreenText.trim()}"`,
    "",
    "Expand the hook into a complete HEIT script with problem, story, takeaway, and CTA.",
    "The body must flow naturally from this specific hook.",
  ].join("\n");
}

async function attachHookOnScreenText(scriptId: number, onScreenText: string, fixedHook: string) {
  const db = await getDb();
  if (!db) return;

  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, scriptId)).limit(1);
  if (!row) return;

  const notes = parseProductionNotes(row.productionNotes) ?? {};
  const merged = JSON.stringify({
    ...notes,
    hookOnScreenText: onScreenText.trim(),
    sections: notes.sections,
  });

  await db
    .update(coachScripts)
    .set({
      hook: fixedHook.trim(),
      productionNotes: merged,
    })
    .where(eq(coachScripts.id, scriptId));
}

export async function expandHookToScript(args: {
  userId: number;
  workspaceId: string;
  openId: string;
  reelContent: string;
  hook: string;
  onScreenText: string;
}): Promise<GeneratedCoachScript> {
  const reelContent = args.reelContent.trim();
  const hook = args.hook.trim();
  const onScreenText = args.onScreenText.trim();

  if (!reelContent || !hook) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Missing hook or content." });
  }

  await updateUserPersonalization(args.userId, {
    businessDescription: reelContent.slice(0, 500),
    targetAudience: "Instagram Reels viewers",
  });

  const selectedSlugs = await routeOnboardingNicheSlugs(reelContent);
  await markOnboardingComplete(args.userId, selectedSlugs, [], null);

  const description = buildDescriptionFromHook({ reelContent, hook, onScreenText });
  const script = await generateCoachScriptForWorkspace({
    userId: args.userId,
    workspaceId: args.workspaceId,
    openId: args.openId,
    description,
    skipUsageCheck: true,
  });

  await attachHookOnScreenText(script.id, onScreenText, hook);

  const db = await getDb();
  if (!db) return script;

  const [updated] = await db.select().from(coachScripts).where(eq(coachScripts.id, script.id)).limit(1);
  if (!updated) return script;

  const sections = parseCoachScriptSections({
    body: updated.body,
    callToAction: updated.callToAction,
    productionNotes: updated.productionNotes,
  });

  return {
    id: updated.id,
    title: updated.title,
    hook: updated.hook,
    body: updated.body,
    callToAction: updated.callToAction,
    explain: sections.explain,
    illustrate: sections.illustrate,
    teach: sections.teach,
    cta: sections.cta,
    platform: updated.platform,
    tone: updated.tone,
    estimatedDuration: updated.estimatedDuration,
    contentType: updated.contentType,
    contentFormat: updated.contentFormat,
    formatLabel: updated.formatLabel,
    productionNotes: updated.productionNotes,
    productionNotesStatus: updated.productionNotesStatus ?? null,
  };
}
