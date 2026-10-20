import type { SocialPlatform } from "@shared/personalization/model";

/** One in-flight profile lookup. A newer id or a different handle wins. */
export type ProfileLookupSession = {
  id: number;
  platform: SocialPlatform;
  handle: string;
};

export function isCurrentProfileLookup(
  active: ProfileLookupSession | null,
  finished: ProfileLookupSession
): boolean {
  if (!active) return false;
  return (
    active.id === finished.id &&
    active.platform === finished.platform &&
    active.handle === finished.handle
  );
}
