/**
 * Saved Remakes reopen in the same Remake workspace they were created in.
 * Ordinary scripts continue to use the standard Script Editor.
 */
export function savedScriptOpenPath(script: {
  id: number;
  recreatedScriptId?: number | null;
}): string {
  if (script.recreatedScriptId != null) {
    return `/scripts/${script.id}/remake`;
  }
  return `/scripts/${script.id}`;
}
