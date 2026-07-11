import { describe, expect, it } from "vitest";
import {
  buildCoachSectionsFromRemakeScript,
  flattenRemakeCoachText,
  normalizeRemakeScriptText,
} from "@shared/remakeStudioImport";

describe("remakeStudioImport", () => {
  it("preserves flat remake text when mapped into Studio sections", () => {
    const input = normalizeRemakeScriptText(
      "[LOOK AT CAMERA] Stop guessing your food costs.\n\n" +
        "Most operators only look at the invoice total.\n\n" +
        "Track yield loss on every prep item instead.\n\n" +
        "Follow for the full spreadsheet."
    );
    const mapped = buildCoachSectionsFromRemakeScript(input);
    const flattened = flattenRemakeCoachText({
      hook: mapped.hook,
      sections: mapped.sections,
    });
    expect(flattened).toBe(input);
  });

  it("handles single-block scripts with sentence split", () => {
    const input = "This is the hook sentence. Here is the rest of the script body.";
    const mapped = buildCoachSectionsFromRemakeScript(input);
    expect(mapped.hook).toBe("This is the hook sentence.");
    expect(mapped.sections.explain).toBe("Here is the rest of the script body.");
  });
});
