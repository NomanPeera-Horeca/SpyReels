import { describe, expect, it } from "vitest";
import {
  findOpenableCreatorJob,
  normalizeCreatorHandle,
  pathForCreatorResearchJob,
} from "./openCreatorInApp";

describe("openCreatorInApp", () => {
  it("normalizes handles", () => {
    expect(normalizeCreatorHandle("@Captain.T.Roll")).toBe("Captain.T.Roll");
    expect(normalizeCreatorHandle("  hub.burritos ")).toBe("hub.burritos");
  });

  it("finds completed or running jobs by handle", () => {
    const jobs = [
      { id: 1, handle: "other", status: "completed" },
      { id: 2, handle: "Captain.T.Roll", status: "failed" },
      { id: 3, handle: "captain.t.roll", status: "completed" },
    ];
    expect(findOpenableCreatorJob(jobs, "@Captain.T.Roll")?.id).toBe(3);
  });

  it("builds in-app research paths", () => {
    expect(
      pathForCreatorResearchJob({ id: 10, platform: "instagram" }, "viral-posts")
    ).toBe("/dashboard?jobId=10&from=viral-posts");
    expect(
      pathForCreatorResearchJob({ id: 11, platform: "tiktok" }, "viral-posts")
    ).toBe("/research?platform=tiktok&jobId=11&from=viral-posts");
  });
});
