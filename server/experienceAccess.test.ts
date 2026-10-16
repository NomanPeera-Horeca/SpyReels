import { afterEach, describe, expect, it } from "vitest";
import { getExperienceAccess } from "./experienceAccess";

const admin = { role: "admin", email: "a@x.com", createdAt: new Date() };

describe("getExperienceAccess", () => {
  const saved = process.env.ONBOARDING_V2_MODE;
  afterEach(() => {
    process.env.ONBOARDING_V2_MODE = saved;
  });

  it("keeps everyone on the current experience until the tables exist", async () => {
    process.env.ONBOARDING_V2_MODE = "internal";
    expect(await getExperienceAccess(admin, async () => false)).toMatchObject({
      onboarding: "legacy",
      home: "research",
    });
    expect((await getExperienceAccess(admin, async () => true)).onboarding).toBe("v2");
  });

  it("does not even check the database when the mode is off", async () => {
    process.env.ONBOARDING_V2_MODE = "off";
    let called = false;
    await getExperienceAccess(admin, async () => {
      called = true;
      return true;
    });
    expect(called).toBe(false);
  });
});
