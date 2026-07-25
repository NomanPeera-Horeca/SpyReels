import type { ComponentType } from "react";
import type {
  CarouselDesignTokens,
  CarouselLayoutId,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselSlideHookBoldCenter } from "@/components/CarouselSlideHookBoldCenter";
import { CarouselSlideListItemNumbered } from "@/components/CarouselSlideListItemNumbered";
import { CarouselSlideCtaBoldCenter } from "@/components/CarouselSlideCtaBoldCenter";

export type CarouselSlideLayoutProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  className?: string;
};

/**
 * Exhaustive map of layoutId -> slide component.
 * Adding a CarouselLayoutId without a registry entry is a TypeScript error.
 */
export const CAROUSEL_LAYOUT_REGISTRY: Record<
  CarouselLayoutId,
  ComponentType<CarouselSlideLayoutProps>
> = {
  hook_bold_center: CarouselSlideHookBoldCenter,
  list_item_numbered: CarouselSlideListItemNumbered,
  cta_bold_center: CarouselSlideCtaBoldCenter,
};
