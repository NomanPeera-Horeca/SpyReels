import { type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { applyCarouselImageFrame } from "@shared/carouselImageFrame";
import { useCarouselEditorChrome } from "@/components/carouselEditorChrome";

export type CarouselEditableImageProps = {
  slotId: string;
  src: string;
  style?: CSSProperties;
  className?: string;
  fill?: boolean;
  children?: ReactNode;
};

export function CarouselEditableImage({
  slotId,
  src,
  style,
  className,
  fill = false,
  children,
}: CarouselEditableImageProps) {
  const chrome = useCarouselEditorChrome();
  const selected = Boolean(
    chrome?.selectionEnabled && chrome.selectedImageSlotId === slotId
  );
  const framed = applyCarouselImageFrame(
    {
      backgroundImage: `url(${src})`,
    },
    chrome?.imageFrames?.[slotId]
  ) as CSSProperties;

  return (
    <div
      className={className}
      data-carousel-image-slot-id={slotId}
      data-carousel-image-selected={selected ? "true" : undefined}
      title={chrome?.selectionEnabled ? "Click to select image" : undefined}
      style={{
        ...style,
        ...(fill
          ? {
              position: "absolute",
              inset: 0,
            }
          : {}),
        overflow: "hidden",
        ...framed,
        cursor: chrome?.selectionEnabled ? "pointer" : style?.cursor,
      }}
      onClick={(event: MouseEvent) => {
        if (!chrome?.selectionEnabled) return;
        event.stopPropagation();
        chrome.onSelectImage?.(slotId);
      }}
    >
      {children}
    </div>
  );
}
