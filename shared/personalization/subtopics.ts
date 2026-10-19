import type { PillarPayload, PillarSubtopic } from "./model";

/** Subtopics the user still sees (removed ones stay stored, never shown). */
export function visibleSubtopics(payload: Pick<PillarPayload, "subtopics">): PillarSubtopic[] {
  return (payload.subtopics ?? []).filter(s => !s.removed);
}

/**
 * Returns the pillar payload with one subtopic removed (or restored), or null
 * when the subtopic does not exist on this pillar.
 */
export function withSubtopicRemoved<P extends PillarPayload>(
  payload: P,
  subtopicId: string,
  removed: boolean
): P | null {
  const list = payload.subtopics ?? [];
  if (!list.some(s => s.id === subtopicId)) return null;
  return {
    ...payload,
    subtopics: list.map(s => (s.id === subtopicId ? { ...s, removed } : s)),
  };
}
