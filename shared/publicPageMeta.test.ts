import { describe, expect, it } from "vitest";
import { isPrivateAppPath } from "./publicPageMeta";

describe("isPrivateAppPath", () => {
  it("treats Carousels product routes as private app shells", () => {
    expect(isPrivateAppPath("/carousels")).toBe(true);
    expect(isPrivateAppPath("/carousels/library")).toBe(true);
    expect(isPrivateAppPath("/carousels/118/edit")).toBe(true);
    expect(isPrivateAppPath("/carousels/new")).toBe(true);
    expect(isPrivateAppPath("/carousel-studio")).toBe(true);
    expect(isPrivateAppPath("/carousel-library")).toBe(true);
    expect(isPrivateAppPath("/pricing")).toBe(false);
  });
});
