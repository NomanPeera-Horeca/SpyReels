import { createContext, useContext } from "react";
import type { CarouselImageFrameOverride } from "@shared/carouselImageFrame";
import type { CarouselSlotStyleOverride } from "@shared/carouselSlotStyle";

export type CarouselTextSelection = {
  slideId: string;
  slotId: string;
  role: string;
};

export type CarouselImageSelection = {
  slideId: string;
  slotId: string;
};

export type CarouselEditorChromeValue = {
  slideId: string;
  selectedSlotId: string | null;
  selectedImageSlotId: string | null;
  selectionEnabled: boolean;
  styles?: Record<string, CarouselSlotStyleOverride>;
  imageFrames?: Record<string, CarouselImageFrameOverride>;
  onSelectSlot?: (slotId: string) => void;
  onSelectImage?: (slotId: string) => void;
};

export const CarouselEditorChromeContext =
  createContext<CarouselEditorChromeValue | null>(null);

export function useCarouselEditorChrome(): CarouselEditorChromeValue | null {
  return useContext(CarouselEditorChromeContext);
}
