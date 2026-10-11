import { describe, expect, it } from "vitest";
import { signupMethodFromLoginMethod } from "./trackSignupCompleted";

describe("signupMethodFromLoginMethod", () => {
  it("maps google and email", () => {
    expect(signupMethodFromLoginMethod("google")).toBe("google");
    expect(signupMethodFromLoginMethod("email")).toBe("email");
  });

  it("falls back to unknown", () => {
    expect(signupMethodFromLoginMethod(null)).toBe("unknown");
    expect(signupMethodFromLoginMethod(undefined)).toBe("unknown");
    expect(signupMethodFromLoginMethod("magic")).toBe("unknown");
  });
});
