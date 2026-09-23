import { afterEach, describe, expect, it } from "vitest";
import {
  isPilotQueueEnabled,
  stableRolloutBucket,
} from "./dispatch";

const FLAG = "DURABLE_QUEUE_CREATOR_DISCOVERY_ENABLED";
const PERCENT = "DURABLE_QUEUE_CREATOR_DISCOVERY_ROLLOUT_PERCENT";
const CAROUSEL_FLAG = "DURABLE_QUEUE_CAROUSEL_ENABLED";
const CAROUSEL_PERCENT = "DURABLE_QUEUE_CAROUSEL_ROLLOUT_PERCENT";

afterEach(() => {
  delete process.env[FLAG];
  delete process.env[PERCENT];
  delete process.env[CAROUSEL_FLAG];
  delete process.env[CAROUSEL_PERCENT];
});

describe("creator discovery durable queue rollout", () => {
  it("fails closed when the feature flag is disabled", () => {
    process.env[FLAG] = "false";
    process.env[PERCENT] = "100";

    expect(isPilotQueueEnabled("creator_discovery", "2")).toBe(false);
  });

  it("fails closed when the percentage is missing, malformed, or out of range", () => {
    process.env[FLAG] = "true";

    expect(isPilotQueueEnabled("creator_discovery", "2")).toBe(false);

    process.env[PERCENT] = "five";
    expect(isPilotQueueEnabled("creator_discovery", "2")).toBe(false);

    process.env[PERCENT] = "101";
    expect(isPilotQueueEnabled("creator_discovery", "2")).toBe(false);
  });

  it("requires a rollout key", () => {
    process.env[FLAG] = "true";
    process.env[PERCENT] = "100";

    expect(isPilotQueueEnabled("creator_discovery")).toBe(false);
  });

  it("routes a stable five-percent cohort and leaves other users inline", () => {
    process.env[FLAG] = "true";
    process.env[PERCENT] = "5";

    expect(stableRolloutBucket("2")).toBe(1);
    expect(stableRolloutBucket("1")).toBe(44);
    expect(isPilotQueueEnabled("creator_discovery", "2")).toBe(true);
    expect(isPilotQueueEnabled("creator_discovery", "1")).toBe(false);
  });

  it("routes every keyed user at one hundred percent", () => {
    process.env[FLAG] = "true";
    process.env[PERCENT] = "100";

    expect(isPilotQueueEnabled("creator_discovery", "1")).toBe(true);
  });
});


describe("carousel durable queue rollout", () => {
  it("fails closed unless both the flag and a valid percentage are configured", () => {
    process.env[CAROUSEL_FLAG] = "true";

    expect(isPilotQueueEnabled("carousel_generation", "2")).toBe(false);

    process.env[CAROUSEL_PERCENT] = "invalid";
    expect(isPilotQueueEnabled("carousel_generation", "2")).toBe(false);

    process.env[CAROUSEL_PERCENT] = "5";
    expect(isPilotQueueEnabled("carousel_generation")).toBe(false);
  });

  it("routes only the stable configured cohort", () => {
    process.env[CAROUSEL_FLAG] = "true";
    process.env[CAROUSEL_PERCENT] = "5";

    expect(isPilotQueueEnabled("carousel_generation", "2")).toBe(true);
    expect(isPilotQueueEnabled("carousel_generation", "1")).toBe(false);
  });
});
