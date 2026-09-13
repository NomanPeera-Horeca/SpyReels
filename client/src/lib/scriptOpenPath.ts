/**
 * My Scripts has one canonical open path.
 *
 * A saved Remake is still the same saved script record, so it opens in the
 * read-first Script Reader like every other library script. The dedicated
 * `/scripts/:id/remake` route remains available to explicit Remake workspace
 * flows, but the library does not fork users into a second editor anymore.
 */
export function savedScriptOpenPath(script: {
  id: number;
  recreatedScriptId?: number | null;
}): string {
  return `/scripts/${script.id}`;
}
