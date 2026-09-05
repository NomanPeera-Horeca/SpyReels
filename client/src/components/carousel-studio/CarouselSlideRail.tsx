import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, MoreHorizontal } from "lucide-react";
import type { CarouselDesignTokens, CarouselSlideSpec } from "@shared/carouselTemplates";
import {
  CAROUSEL_EDITOR_MAX_SLIDES,
  CAROUSEL_EDITOR_MIN_SLIDES,
  moveSlideId,
} from "@shared/carouselSlideManagement";

type CarouselSlideRailProps = {
  slides: CarouselSlideSpec[];
  currentSlideId: string | undefined;
  aspectRatio: CarouselDesignTokens["aspectRatio"];
  disabled?: boolean;
  menuDisabled?: boolean;
  renderPreview: (slide: CarouselSlideSpec) => ReactNode;
  onSelect: (slideId: string) => void;
  onReorder: (orderedSlideIds: string[]) => void;
  onDuplicate: (slideId: string) => void;
  onDelete: (slideId: string) => void;
};

export function CarouselSlideRail({
  slides,
  currentSlideId,
  aspectRatio,
  disabled = false,
  menuDisabled = false,
  renderPreview,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
}: CarouselSlideRailProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null | undefined>(
    undefined
  );
  const [menuSlideId, setMenuSlideId] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuSlideId) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = railRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      setMenuSlideId(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuSlideId]);

  const canDuplicate = slides.length < CAROUSEL_EDITOR_MAX_SLIDES;
  const canDelete = slides.length > CAROUSEL_EDITOR_MIN_SLIDES;
  const ids = slides.map((slide) => slide.id);

  const aspectClass =
    aspectRatio === "1:1" ? "1 / 1" : aspectRatio === "9:16" ? "9 / 16" : "4 / 5";

  const commitDrop = (beforeId: string | null) => {
    if (!draggingId || disabled) return;
    const next = moveSlideId(ids, draggingId, beforeId);
    setDraggingId(null);
    setDropBeforeId(undefined);
    if (next.join("\0") === ids.join("\0")) return;
    onReorder(next);
  };

  return (
    <div
      className={`thumbs${draggingId && dropBeforeId === null ? " drop-end" : ""}`}
      ref={railRef}
      onDragOver={(event) => {
        if (!draggingId || disabled) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (dropBeforeId === null) commitDrop(null);
      }}
    >
      {slides.map((slide, index) => {
        const active = slide.id === currentSlideId;
        const menuOpen = menuSlideId === slide.id;
        const showDropBefore =
          draggingId != null &&
          dropBeforeId === slide.id &&
          draggingId !== slide.id;
        return (
          <div
            key={slide.id}
            className={[
              "thumb",
              active ? "active" : "",
              draggingId === slide.id ? "dragging" : "",
              menuOpen ? "menu-open" : "",
              showDropBefore ? "drop-before" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              if (disabled) return;
              onSelect(slide.id);
            }}
            onDragOver={(event) => {
              if (!draggingId || disabled) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              const before =
                event.clientY < rect.top + rect.height / 2
                  ? slide.id
                  : slides[index + 1]?.id ?? null;
              setDropBeforeId(before);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const before =
                dropBeforeId === undefined ? slide.id : dropBeforeId;
              commitDrop(before);
            }}
          >
            <button
              type="button"
              className="thumb-handle"
              aria-label={`Drag to reorder slide ${index + 1}`}
              draggable={!disabled}
              disabled={disabled}
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => {
                if (disabled) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", slide.id);
                setDraggingId(slide.id);
                onSelect(slide.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDropBeforeId(undefined);
              }}
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const from = ids.indexOf(slide.id);
                const to = event.key === "ArrowUp" ? from - 1 : from + 1;
                if (to < 0 || to >= ids.length) return;
                const next = ids.slice();
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                onReorder(next);
              }}
            >
              <GripVertical size={14} />
            </button>
            <div className="thumb-num">{index + 1}</div>
            <div className="thumb-preview" style={{ aspectRatio: aspectClass }}>
              <div className="thumb-preview-scale">{renderPreview(slide)}</div>
            </div>
            <div className="thumb-menu">
              <button
                type="button"
                className="thumb-menu-btn"
                aria-label={`Slide ${index + 1} actions`}
                aria-expanded={menuOpen}
                disabled={disabled || menuDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(slide.id);
                  setMenuSlideId(menuOpen ? null : slide.id);
                }}
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen ? (
                <div className="thumb-menu-pop" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canDuplicate || disabled || menuDisabled}
                    title={
                      canDuplicate
                        ? "Duplicate slide"
                        : `Carousels can have at most ${CAROUSEL_EDITOR_MAX_SLIDES} slides`
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuSlideId(null);
                      if (!canDuplicate) return;
                      onDuplicate(slide.id);
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={!canDelete || disabled || menuDisabled}
                    title={
                      canDelete
                        ? "Delete slide"
                        : `Carousels need at least ${CAROUSEL_EDITOR_MIN_SLIDES} slides`
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuSlideId(null);
                      if (!canDelete) return;
                      onDelete(slide.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
