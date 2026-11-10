import { describe, expect, it } from "vitest";
import { pickInstagramCreators, pickTikTokCreators, searchedKey, similarDayKey } from "./similarCreators";

describe("pickTikTokCreators", () => {
  it("keeps active public mid-size creators, closest to ~200k followers first", () => {
    const picked = pickTikTokCreators([
      { unique_id: "tiny", follower_count: 2_000, aweme_count: 300 },
      { unique_id: "mega", follower_count: 40_000_000, aweme_count: 900 },
      { unique_id: "inactive", follower_count: 150_000, aweme_count: 3 },
      { unique_id: "private", follower_count: 150_000, aweme_count: 300, secret: true },
      { unique_id: "big", follower_count: 3_000_000, aweme_count: 500 },
      { unique_id: "sweet", follower_count: 220_000, aweme_count: 400 },
      { unique_id: "small", follower_count: 20_000, aweme_count: 80 },
    ]);
    expect(picked).toEqual(["sweet", "small", "big"]);
  });
});

describe("pickInstagramCreators", () => {
  it("keeps the first few usernames", () => {
    expect(pickInstagramCreators([{ username: "a" }, { username: "" }, { username: " b " }], 5)).toEqual(["a", "b"]);
  });
});

describe("keys", () => {
  it("fit the 10-character spend table key and change every week", () => {
    const d = new Date("2026-11-02T10:00:00Z");
    expect(similarDayKey(d)).toBe("sc20261102");
    const k = searchedKey("home-workouts", "tiktok", d);
    expect(k).toHaveLength(10);
    expect(searchedKey("home-workouts", "instagram", d)).not.toBe(k);
    expect(searchedKey("home-workouts", "tiktok", new Date("2026-11-10T10:00:00Z"))).not.toBe(k);
  });
});
