import { describe, expect, it } from "vitest";
import {
  CAROUSEL_EDITOR_DOCUMENT_TITLE,
  CAROUSEL_LIBRARY_DOCUMENT_TITLE,
  CAROUSELS_DOCUMENT_TITLE,
  carouselDocumentTitleForPath,
} from "./carouselPageMeta";

describe("carousel document titles", () => {
  it("maps working Carousel routes to product titles, never Page Not Found", () => {
    expect(carouselDocumentTitleForPath("/carousels")).toBe(CAROUSELS_DOCUMENT_TITLE);
    expect(carouselDocumentTitleForPath("/carousels/library")).toBe(
      CAROUSEL_LIBRARY_DOCUMENT_TITLE
    );
    expect(carouselDocumentTitleForPath("/carousels/118/edit")).toBe(
      CAROUSEL_EDITOR_DOCUMENT_TITLE
    );
    expect(carouselDocumentTitleForPath("/carousels/new")).toBe(
      CAROUSEL_EDITOR_DOCUMENT_TITLE
    );
    expect(carouselDocumentTitleForPath("/carousel-library")).toBe(
      CAROUSEL_LIBRARY_DOCUMENT_TITLE
    );
    expect(carouselDocumentTitleForPath("/carousel-studio")).toBe(
      CAROUSEL_EDITOR_DOCUMENT_TITLE
    );
    expect(carouselDocumentTitleForPath("/carousels")).not.toMatch(/Page Not Found/i);
    expect(carouselDocumentTitleForPath("/studio")).toBeNull();
  });
});
