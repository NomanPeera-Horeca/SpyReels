/**
 * My Scripts opens every saved script in the same read-first workspace.
 * The /remake suffix is retained as a backwards-compatible route while the
 * reader becomes the library entry point for ordinary scripts and Remakes.
 * The full editor remains available at /scripts/:id from the Reader.
 */
export function savedScriptOpenPath(script: {
  id: number;
  recreatedScriptId?: number | null;
}): string {
  return `/scripts/${script.id}/remake`;
}
