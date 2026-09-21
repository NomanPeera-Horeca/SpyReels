import { describe, expect, it } from "vitest";
import { checkReadiness } from "./health";

describe("health readiness", () => {
  it("reports ready when dependencies answer", async () => {
    await expect(checkReadiness(async () => undefined)).resolves.toEqual({
      ok: true,
      checks: { database: "ok" },
    });
  });

  it("reports unavailable when a dependency fails", async () => {
    await expect(
      checkReadiness(async () => {
        throw new Error("down");
      })
    ).resolves.toEqual({
      ok: false,
      checks: { database: "unavailable" },
    });
  });

  it("fails closed when a dependency exceeds the readiness budget", async () => {
    await expect(
      checkReadiness(() => new Promise(() => undefined), 1)
    ).resolves.toEqual({
      ok: false,
      checks: { database: "unavailable" },
    });
  });
});
