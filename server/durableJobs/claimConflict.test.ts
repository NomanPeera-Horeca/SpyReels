import { describe, expect, it } from "vitest";
import { isTransientLockConflict } from "./queue";

describe("transient claim conflicts", () => {
  it("recognizes a MySQL deadlock and a lock wait, including a wrapped cause", () => {
    expect(isTransientLockConflict({ code: "ER_LOCK_DEADLOCK", errno: 1213 })).toBe(true);
    expect(isTransientLockConflict({ code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205 })).toBe(true);
    expect(
      isTransientLockConflict({
        message: "query failed",
        cause: { message: "Deadlock found when trying to get lock" },
      })
    ).toBe(true);
    expect(isTransientLockConflict({ code: "ER_DUP_ENTRY", errno: 1062 })).toBe(false);
    expect(isTransientLockConflict(new Error("connection refused"))).toBe(false);
  });
});
