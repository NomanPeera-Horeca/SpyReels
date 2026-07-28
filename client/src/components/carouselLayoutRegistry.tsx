import type { ComponentType } from "react";
import type {
  CarouselDesignTokens,
  CarouselLayoutId,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselSlideHookBoldCenter } from "@/components/CarouselSlideHookBoldCenter";
import { CarouselSlideListItemNumbered } from "@/components/CarouselSlideListItemNumbered";
import { CarouselSlideCtaBoldCenter } from "@/components/CarouselSlideCtaBoldCenter";
import { CarouselSlideHookPhotoTop } from "@/components/CarouselSlideHookPhotoTop";
import { CarouselSlidePhotoCaptionBubble } from "@/components/CarouselSlidePhotoCaptionBubble";
import { CarouselSlideNotebookCover } from "@/components/CarouselSlideNotebookCover";
import { CarouselSlideNotebookListItem } from "@/components/CarouselSlideNotebookListItem";

export type CarouselSlideLayoutProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  /** Optional Instagram handle overlay; render-only, never sent to AI. */
  handle?: string;
  /** Resolved photo URL for layouts that have an image region. */
  imageUrl?: string;
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
  hook_photo_top: CarouselSlideHookPhotoTop,
  photo_caption_bubble: CarouselSlidePhotoCaptionBubble,
  notebook_cover: CarouselSlideNotebookCover,
  notebook_list_item: CarouselSlideNotebookListItem,
};
