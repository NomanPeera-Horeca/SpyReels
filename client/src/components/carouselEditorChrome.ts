import { createContext, useContext } from "react";
import type { CarouselSlotStyleOverride } from "@shared/carouselSlotStyle";

export type CarouselTextSelection = {
  slideId: string;
  slotId: string;
  role: string;
};

export type CarouselEditorChromeValue = {
  slideId: string;
  selectedSlotId: string | null;
  selectionEnabled: boolean;
  styles?: Record<string, CarouselSlotStyleOverride>;
  onSelectSlot?: (slotId: string) => void;
};

export const CarouselEditorChromeContext =
  createContext<CarouselEditorChromeValue | null>(null);

export function useCarouselEditorChrome(): CarouselEditorChromeValue | null {
  return useContext(CarouselEditorChromeContext);
}
