import type { ComponentType } from "react";
import type {
  CarouselDesignTokens,
  CarouselLayoutId,
  CarouselSlideSpec,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { isBreakdownListicleSlide } from "@shared/carouselBreakdownFamily";
import { CarouselBreakdownPremiumFamily } from "@/components/CarouselBreakdownPremiumFamily";
import { CarouselSlideHookBoldCenter } from "@/components/CarouselSlideHookBoldCenter";
import { CarouselSlideListItemNumbered } from "@/components/CarouselSlideListItemNumbered";
import { CarouselSlideCtaBoldCenter } from "@/components/CarouselSlideCtaBoldCenter";
import { CarouselSlideHookPhotoTop } from "@/components/CarouselSlideHookPhotoTop";
import { CarouselSlidePhotoCaptionBubble } from "@/components/CarouselSlidePhotoCaptionBubble";
import { CarouselSlideNotebookCover } from "@/components/CarouselSlideNotebookCover";
import { CarouselSlideNotebookListItem } from "@/components/CarouselSlideNotebookListItem";
import { CarouselSlideListItemWarmNumbered } from "@/components/CarouselSlideListItemWarmNumbered";
import { CarouselSlideQuoteTweetCard } from "@/components/CarouselSlideQuoteTweetCard";
import { CarouselSlideExcuseGrid4 } from "@/components/CarouselSlideExcuseGrid4";
import { CarouselSlideExcuseSplitStack } from "@/components/CarouselSlideExcuseSplitStack";
import { CarouselSlideStatSplitStack } from "@/components/CarouselSlideStatSplitStack";
import { CarouselSlidePhotoQuoteBubbles } from "@/components/CarouselSlidePhotoQuoteBubbles";

export type CarouselSlideLayoutProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  /** Optional Instagram handle overlay; render-only, never sent to AI. */
  handle?: string;
  /** Resolved photo URL for layouts that have a single image region. */
  imageUrl?: string;
  /** Multi-slot photo map (excuse grid / split stack). */
  imageUrlsBySlot?: Record<string, string>;
  className?: string;
  /** When true, text slots are click-to-edit (remake review only). */
  editable?: boolean;
  /** Commit a slot edit; slotId matches template slot ids. */
  onSlotChange?: (slotId: string, value: string) => void;
  /** Breakdown family metadata. Ignored by legacy layouts. */
  composition?: CarouselSlideSpec["composition"];
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
  list_item_warm_numbered: CarouselSlideListItemWarmNumbered,
  quote_tweet_card: CarouselSlideQuoteTweetCard,
  excuse_grid_4: CarouselSlideExcuseGrid4,
  excuse_split_stack: CarouselSlideExcuseSplitStack,
  stat_split_stack: CarouselSlideStatSplitStack,
  photo_quote_bubbles: CarouselSlidePhotoQuoteBubbles,
};

export function resolveCarouselSlideComponent(
  slide: Pick<CarouselSlideSpec, "layoutId" | "composition">
): ComponentType<CarouselSlideLayoutProps> {
  if (isBreakdownListicleSlide(slide)) {
    return CarouselBreakdownPremiumFamily;
  }
  return CAROUSEL_LAYOUT_REGISTRY[slide.layoutId];
}
