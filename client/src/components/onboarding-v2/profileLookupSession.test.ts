import { describe, expect, it } from "vitest";
import { isCurrentProfileLookup, type ProfileLookupSession } from "./profileLookupSession";

const first: ProfileLookupSession = { id: 1, platform: "instagram", handle: "@ada" };

describe("isCurrentProfileLookup", () => {
  it("accepts the lookup that is still the active one", () => {
    expect(isCurrentProfileLookup(first, first)).toBe(true);
  });

  it("ignores a lookup that finished after cancel", () => {
    expect(isCurrentProfileLookup(null, first)).toBe(false);
  });

  it("ignores an older lookup once a newer one has started", () => {
    const newer: ProfileLookupSession = { id: 2, platform: "instagram", handle: "@ada" };
    expect(isCurrentProfileLookup(newer, first)).toBe(false);
  });

  it("ignores a result for a handle the customer already replaced", () => {
    const replaced: ProfileLookupSession = { id: 1, platform: "instagram", handle: "@other" };
    expect(isCurrentProfileLookup(replaced, first)).toBe(false);
  });

  it("ignores a result for a different platform", () => {
    const replaced: ProfileLookupSession = { id: 1, platform: "tiktok", handle: "@ada" };
    expect(isCurrentProfileLookup(replaced, first)).toBe(false);
  });
});
