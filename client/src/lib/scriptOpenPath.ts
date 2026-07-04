/** Open structured Studio scripts in /studio; legacy flat scripts stay in ScriptEditor. */
export function savedScriptOpenPath(script: {
  id: number;
  coachScriptId?: number | null;
}): string {
  if (script.coachScriptId != null && script.coachScriptId > 0) {
    return `/studio?script=${script.coachScriptId}`;
  }
  return `/scripts/${script.id}`;
}
