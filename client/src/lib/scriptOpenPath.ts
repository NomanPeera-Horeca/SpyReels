/** My Scripts always opens the Script Editor for filming; use Studio from the editor when needed. */
export function savedScriptOpenPath(script: { id: number }): string {
  return `/scripts/${script.id}`;
}
