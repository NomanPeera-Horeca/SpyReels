import { describe, expect, it } from "vitest";
import { validateRemakeBenchmarkClaims } from "./remakeBenchmarkProxy";

function validClaims() {
  return {
    repository: "NomanPeera-Horeca/SpyReels",
    job_workflow_ref:
      "NomanPeera-Horeca/SpyReels/.github/workflows/remake-hardening-live-benchmark.yml@refs/pull/71/merge",
    event_name: "pull_request",
    ref: "refs/pull/71/merge",
    run_id: "123456",
  };
}

describe("validateRemakeBenchmarkClaims", () => {
  it("accepts the PR71 benchmark workflow", () => {
    expect(validateRemakeBenchmarkClaims(validClaims())).toEqual({
      runId: "123456",
    });
  });

  it("accepts an explicit workflow dispatch on the hardening branch", () => {
    expect(
      validateRemakeBenchmarkClaims({
        ...validClaims(),
        event_name: "workflow_dispatch",
        ref: "refs/heads/feature/remake-hardening-v1",
      })
    ).toEqual({ runId: "123456" });
  });

  it("rejects a different repository", () => {
    expect(() =>
      validateRemakeBenchmarkClaims({
        ...validClaims(),
        repository: "someone/else",
      })
    ).toThrow("Unexpected GitHub repository");
  });

  it("rejects a different workflow", () => {
    expect(() =>
      validateRemakeBenchmarkClaims({
        ...validClaims(),
        job_workflow_ref:
          "NomanPeera-Horeca/SpyReels/.github/workflows/ci.yml@refs/pull/71/merge",
      })
    ).toThrow("Unexpected GitHub workflow");
  });

  it("rejects a different ref", () => {
    expect(() =>
      validateRemakeBenchmarkClaims({
        ...validClaims(),
        ref: "refs/heads/main",
      })
    ).toThrow("Unexpected benchmark ref");
  });
});
