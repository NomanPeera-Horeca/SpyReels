import { getSavedScriptsByWorkspace, updateSavedScript } from "../server/db";
import { deriveScriptTitle, isWeakScriptTitle } from "../shared/scriptTitle";

const HARD_LIMIT = 15;

async function main() {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    throw new Error("WORKSPACE_ID is required. This backfill is intentionally workspace-scoped.");
  }

  const scripts = await getSavedScriptsByWorkspace(workspaceId);
  const latest = [...scripts]
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return b.id - a.id;
    })
    .slice(0, HARD_LIMIT);

  let updated = 0;
  for (const script of latest) {
    if (!isWeakScriptTitle(script.title)) continue;
    const nextTitle = deriveScriptTitle({ content: script.content });
    if (!nextTitle || nextTitle === script.title) continue;
    await updateSavedScript(script.id, { title: nextTitle });
    updated += 1;
    console.log(`[title-backfill] ${script.id}: ${JSON.stringify(script.title)} -> ${JSON.stringify(nextTitle)}`);
  }

  console.log(`[title-backfill] checked ${latest.length} newest scripts, updated ${updated}. Hard limit=${HARD_LIMIT}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
