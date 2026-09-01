import { describe, expect, it } from "vitest";
import {
  bindBriefOutlineToSlides,
  selectSemanticallyValidCarouselBriefs,
  validateCarouselBriefSemantics,
  validateCopyBriefAdherence,
} from "@shared/carouselStudio";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import {
  buildCarouselRemakePrompt,
  effectiveSlidesForCreativeBrief,
} from "../generateCarouselRemake";
import { buildCarouselAnglesRepairNote } from "../generateCarouselAngles";
import {
  CASH_LEAKS_MISSING_LEAK1_VALUES,
  CASH_LEAKS_REMAKE_64_BRIEF,
  CASH_LEAKS_REMAKE_64_SLIDE_IDS,
  CASH_LEAKS_REMAKE_64_SLIDE_ROLES,
  CASH_LEAKS_REMAKE_64_VALUES,
  VALID_FIVE_LEAK_FIVE_FIX_VALUES,
  validFiveLeakFiveFixBrief,
} from "./fixtures/cashLeaksRemake64";

function adherenceIssues(
  values = CASH_LEAKS_REMAKE_64_VALUES,
  brief = CASH_LEAKS_REMAKE_64_BRIEF
) {
  return validateCopyBriefAdherence({
    brief,
    slideIds: CASH_LEAKS_REMAKE_64_SLIDE_IDS,
    slideRoles: CASH_LEAKS_REMAKE_64_SLIDE_ROLES,
    values,
  });
}

describe("carousel remake 64 brief semantics", () => {
  it("rejects the selected brief for five plugs with only two fixes", () => {
    const issues = validateCarouselBriefSemantics(CASH_LEAKS_REMAKE_64_BRIEF);
    expect(issues.some((issue) => /5 solutions/.test(issue))).toBe(true);
    expect(
      selectSemanticallyValidCarouselBriefs([CASH_LEAKS_REMAKE_64_BRIEF]).briefs
    ).toEqual([]);
  });

  it("accepts a valid five-leak five-fix outline", () => {
    const brief = validFiveLeakFiveFixBrief();
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toHaveLength(1);
  });

  it("puts semantic issues into the existing one-time angle repair note", () => {
    const issues = validateCarouselBriefSemantics(CASH_LEAKS_REMAKE_64_BRIEF);
    const note = buildCarouselAnglesRepairNote(2, [
      `Brief "${CASH_LEAKS_REMAKE_64_BRIEF.title}": ${issues.join("; ")}`,
    ]);
    expect(note).toContain("matching contentFormat and layoutFamily");
    expect(note).toContain("Semantic issues to fix");
    expect(note).toContain("solutions that were not introduced");
  });
});

describe("carousel remake 64 copy adherence", () => {
  it("catches missing Leak 1 and Fix 1 before Leak 1", () => {
    const issues = adherenceIssues(CASH_LEAKS_MISSING_LEAK1_VALUES);
    expect(issues.some((issue) => /Missing Leak 1/.test(issue))).toBe(true);
    expect(issues.some((issue) => /Fix 1 appears before Leak 1/.test(issue))).toBe(
      true
    );
  });

  it("catches a five-plugs summary when fewer than five fixes were written", () => {
    const issues = adherenceIssues();
    expect(issues.some((issue) => /5 solutions/.test(issue))).toBe(true);
  });

  it("catches multiple CTA slides and a CTA before the final slide", () => {
    const issues = adherenceIssues();
    expect(issues).toContain("More than one CTA slide exists");
    expect(issues).toContain("CTA appears before the final slide");
  });

  it("catches copy that ignores the planned context and Leak 1 positions", () => {
    const issues = adherenceIssues();
    expect(
      issues.some((issue) =>
        /Position 2 title\/body does not match planned objective/.test(issue)
      )
    ).toBe(true);
    expect(issues.some((issue) => /Position 3 is missing Leak 1/.test(issue))).toBe(
      true
    );
  });

  it("flags unsupported claim_verification wording from the generated slides", () => {
    const issues = adherenceIssues();
    expect(
      issues.some((issue) => /Most owners have at least two of these/.test(issue))
    ).toBe(true);
    expect(
      issues.some((issue) => /All five plugged means predictable cash/.test(issue))
    ).toBe(true);
    expect(issues.some((issue) => /A reserve is not a luxury/.test(issue))).toBe(
      true
    );
  });

  it("accepts copy that follows a valid five-leak five-fix outline", () => {
    expect(
      validateCopyBriefAdherence({
        brief: validFiveLeakFiveFixBrief(),
        slideIds: CASH_LEAKS_REMAKE_64_SLIDE_IDS,
        slideRoles: CASH_LEAKS_REMAKE_64_SLIDE_ROLES,
        values: VALID_FIVE_LEAK_FIVE_FIX_VALUES,
      })
    ).toEqual([]);
  });
});

describe("brief-to-slide positional mapping", () => {
  const template = CAROUSEL_TEMPLATES_BY_ID.get("photo_story_test");

  it("maps outline position N to effectiveSlides position N exactly", () => {
    expect(template).toBeDefined();
    const slides = effectiveSlidesForCreativeBrief(
      template!,
      CASH_LEAKS_REMAKE_64_BRIEF
    );
    expect(slides).toHaveLength(12);
    const bindings = bindBriefOutlineToSlides(
      CASH_LEAKS_REMAKE_64_BRIEF.slideOutline,
      slides.map((slide) => slide.id)
    );
    bindings.forEach((binding, index) => {
      expect(binding.position).toBe(index + 1);
      expect(binding.slideId).toBe(slides[index]?.id);
      expect(binding.slideId).toBe(`slide_${String(index + 1).padStart(2, "0")}`);
    });
    expect(bindings[2]?.objective).toContain("Leak 1");
    expect(bindings[1]?.objective).toContain("cash flow from profit");
  });

  it("binds each planned objective onto the matching slide in the copy prompt", () => {
    expect(template).toBeDefined();
    const slides = effectiveSlidesForCreativeBrief(
      template!,
      CASH_LEAKS_REMAKE_64_BRIEF
    );
    const prompt = buildCarouselRemakePrompt(
      template!.name,
      template!.description,
      slides,
      "infer from source",
      new Map(),
      "Make me a carousel about why small businesses run out of cash.",
      CASH_LEAKS_REMAKE_64_BRIEF
    );
    expect(prompt).toContain("Outline position N maps to the Nth slide exactly");
    expect(prompt).toContain(
      "Slide slide_02 (position 2, layout role: list_item)"
    );
    expect(prompt).toContain(
      "Distinguish cash flow from profit to frame why these leaks are invisible to most owners."
    );
    expect(prompt).toContain(
      "Slide slide_03 (position 3, layout role: list_item)"
    );
    expect(prompt).toContain("Introduce Leak 1 (invoice timing)");
    expect(prompt).toContain("Many owners may have more than one");
  });
});
