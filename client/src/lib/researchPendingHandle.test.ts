import { afterEach, describe, expect, it } from "vitest";
import {
  applyLandingAuthHandoff,
  consumeResearchPendingHandle,
  hasResearchPendingHandle,
  parseLandingAuthQuery,
  stashResearchHandleForAfterAuth,
} from "./researchPendingHandle";

const memory = new Map<string, string>();
const sessionStorageStub = {
  getItem(key: string) {
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
  },
  removeItem(key: string) {
    memory.delete(key);
  },
  clear() {
    memory.clear();
  },
};

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorageStub,
});

afterEach(() => {
  memory.clear();
});

describe("landing auth query handoff", () => {
  it("reads the Viral Reel Finder signup URL the Next page actually emits", () => {
    const parsed = parseLandingAuthQuery(
      "?auth=signup&returnTo=%2Fresearch&researchHandle=noman_peera"
    );

    expect(parsed).toEqual({
      auth: "signup",
      returnTo: "/research",
      researchHandle: "noman_peera",
    });
  });

  it("rejects unsafe returnTo values", () => {
    expect(parseLandingAuthQuery("?auth=signup&returnTo=https://evil.test").returnTo).toBeUndefined();
    expect(parseLandingAuthQuery("?auth=signup&returnTo=//evil.test").returnTo).toBeUndefined();
  });

  it("stashes the handle so /research can consume it after auth", () => {
    const parsed = applyLandingAuthHandoff(
      "?auth=signup&returnTo=/research&researchHandle=noman_peera"
    );
    expect(parsed.auth).toBe("signup");
    expect(parsed.returnTo).toBe("/research");

    const pending = consumeResearchPendingHandle();
    expect(pending).toEqual({
      handle: "noman_peera",
      autostart: true,
      platform: "instagram",
    });
    expect(consumeResearchPendingHandle().handle).toBeNull();
  });
});

describe("hasResearchPendingHandle", () => {
  it("is false when nothing is stashed", () => {
    expect(hasResearchPendingHandle()).toBe(false);
  });

  it("is true after a stash and does NOT consume it", () => {
    stashResearchHandleForAfterAuth("nike", true, "instagram");
    expect(hasResearchPendingHandle()).toBe(true);
    expect(hasResearchPendingHandle()).toBe(true);
    expect(consumeResearchPendingHandle().handle).toBe("nike");
    expect(hasResearchPendingHandle()).toBe(false);
  });
});
