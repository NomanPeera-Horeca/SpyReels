import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  previewCaptionFromSlots,
  previewDisplayName,
  previewHandleLabel,
  socialPreviewTitle,
} from "./socialPreviewCopy";

const here = dirname(fileURLToPath(import.meta.url));

describe("carousel social preview", () => {
  it("uses real slot copy for the caption when present", () => {
    expect(previewCaptionFromSlots({ headline: "Cut the menu" })).toBe(
      "Cut the menu"
    );
    expect(previewCaptionFromSlots({})).toBe("");
    expect(previewHandleLabel("@horeca", "Noman")).toBe("horeca");
    expect(previewDisplayName("Noman Peera", "horeca")).toBe("Noman Peera");
    expect(socialPreviewTitle("instagram")).toBe("Instagram preview");
    expect(socialPreviewTitle("linkedin")).toBe("LinkedIn preview");
  });

  it("keeps Preview separate from the download package modal", () => {
    const studioApp = readFileSync(join(here, "CarouselStudioApp.tsx"), "utf8");
    expect(studioApp).toContain("CarouselSocialPreview");
    expect(studioApp).toContain("setSocialPreviewOpen(true)");
    expect(studioApp).not.toMatch(/openPackageModal\(false\)/);
    expect(studioApp).toContain("openPackageModal(true)");
    expect(studioApp).not.toMatch(/312/);
    expect(studioApp).not.toMatch(/2\.8%/);
    expect(studioApp).not.toMatch(/Performance score/);
    expect(studioApp).not.toMatch(/Save brand profile/);
    expect(studioApp).not.toMatch(/STUDIO_NAV_ITEMS/);
  });
});
