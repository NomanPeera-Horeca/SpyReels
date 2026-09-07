import { afterEach, describe, expect, it } from "vitest";
import {
  bindCarouselLaunchRemake,
  clearCarouselLaunchTicket,
  hasCarouselLaunchStartedInPage,
  markCarouselLaunchStarted,
  markCarouselLaunchStartedInPage,
  readCarouselLaunchTicket,
  resetCarouselLaunchPageStateForTests,
  resolveCarouselLaunchReplay,
} from "./carouselLaunchSession";

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
  resetCarouselLaunchPageStateForTests();
});

describe("carousel launch session", () => {
  it("starts a launch that has no ticket yet", () => {
    expect(
      resolveCarouselLaunchReplay({
        launchId: "launch-a",
        content: "menu idea",
        ticket: null,
        startedInThisPage: false,
      })
    ).toEqual({ action: "start" });
  });

  it("treats a new launch id as a new intent even if content matches", () => {
    markCarouselLaunchStarted("launch-a", "menu idea");
    expect(
      resolveCarouselLaunchReplay({
        launchId: "launch-b",
        content: "menu idea",
        ticket: readCarouselLaunchTicket(),
        startedInThisPage: false,
      })
    ).toEqual({ action: "start" });
  });

  it("skips auto-generate on refresh of an in-flight launch", () => {
    markCarouselLaunchStarted("launch-a", "menu idea");
    expect(
      resolveCarouselLaunchReplay({
        launchId: "launch-a",
        content: "menu idea",
        ticket: readCarouselLaunchTicket(),
        startedInThisPage: false,
      })
    ).toEqual({ action: "skip_in_flight" });
  });

  it("restarts generate after a same-page remount once this page already started", () => {
    markCarouselLaunchStarted("launch-a", "menu idea");
    markCarouselLaunchStartedInPage("launch-a");
    expect(hasCarouselLaunchStartedInPage("launch-a")).toBe(true);
    expect(
      resolveCarouselLaunchReplay({
        launchId: "launch-a",
        content: "menu idea",
        ticket: readCarouselLaunchTicket(),
        startedInThisPage: true,
      })
    ).toEqual({ action: "start" });
  });

  it("resumes the bound remake instead of generating again", () => {
    markCarouselLaunchStarted("launch-a", "menu idea");
    bindCarouselLaunchRemake("launch-a", 42);
    expect(
      resolveCarouselLaunchReplay({
        launchId: "launch-a",
        content: "menu idea",
        ticket: readCarouselLaunchTicket(),
        startedInThisPage: false,
      })
    ).toEqual({ action: "resume", remakeId: 42 });
  });

  it("clears the ticket so a later fail/cancel can start again", () => {
    markCarouselLaunchStarted("launch-a", "menu idea");
    clearCarouselLaunchTicket();
    expect(readCarouselLaunchTicket()).toBeNull();
    expect(
      resolveCarouselLaunchReplay({
        launchId: "launch-a",
        content: "menu idea",
        ticket: readCarouselLaunchTicket(),
        startedInThisPage: false,
      })
    ).toEqual({ action: "start" });
  });
});
