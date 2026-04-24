import {
  Children,
  ReactElement,
  ReactNode,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  /** "right" places the tip beside the trigger (e.g. sidebar). Omit for legacy top/bottom flip. */
  side?: "right";
};

type Placement = "top" | "bottom" | "right";

const HOVER_DELAY_MS = 250;
const LONG_PRESS_DELAY_MS = 500;
const TOOLTIP_GAP_PX = 10;
const VIEWPORT_PADDING_PX = 8;

export default function Tooltip({ content, children, side }: TooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [placement, setPlacement] = useState<Placement>("top");
  const tooltipId = useId();

  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
    };
  }, []);

  const clearHoverTimeout = () => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const clearLongPressTimeout = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const hideTooltip = () => {
    clearHoverTimeout();
    clearLongPressTimeout();
    setOpen(false);
  };

  const showTooltipWithDelay = () => {
    clearHoverTimeout();
    hoverTimeoutRef.current = window.setTimeout(() => {
      setOpen(true);
    }, HOVER_DELAY_MS);
  };

  useEffect(() => {
    if (!open) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") hideTooltip();
    };
    const onScroll = () => hideTooltip();

    window.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      clearHoverTimeout();
      clearLongPressTimeout();
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    if (side === "right") {
      const leftPos = triggerRect.right + TOOLTIP_GAP_PX;
      const verticalCenter =
        triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      const clampedTop = Math.min(
        Math.max(verticalCenter, VIEWPORT_PADDING_PX),
        window.innerHeight - tooltipRect.height - VIEWPORT_PADDING_PX
      );
      const clampedLeft = Math.min(
        Math.max(leftPos, VIEWPORT_PADDING_PX),
        window.innerWidth - tooltipRect.width - VIEWPORT_PADDING_PX
      );
      setPlacement("right");
      setPosition({ left: clampedLeft, top: clampedTop });
      return;
    }

    const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const clampedLeft = Math.min(
      Math.max(centeredLeft, VIEWPORT_PADDING_PX),
      window.innerWidth - tooltipRect.width - VIEWPORT_PADDING_PX
    );

    const topCandidate = triggerRect.top - tooltipRect.height - TOOLTIP_GAP_PX;
    const shouldFlipBottom = topCandidate < VIEWPORT_PADDING_PX;

    if (shouldFlipBottom) {
      setPlacement("bottom");
      setPosition({
        left: clampedLeft,
        top: triggerRect.bottom + TOOLTIP_GAP_PX,
      });
      return;
    }

    setPlacement("top");
    setPosition({
      left: clampedLeft,
      top: topCandidate,
    });
  }, [open, content, side]);

  const triggerProps = {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
    },
    "aria-describedby": open ? tooltipId : undefined,
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") return;
      showTooltipWithDelay();
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") return;
      hideTooltip();
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") return;
      clearLongPressTimeout();
      longPressTimeoutRef.current = window.setTimeout(() => {
        setOpen(true);
      }, LONG_PRESS_DELAY_MS);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") return;
      clearLongPressTimeout();
      hideTooltip();
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") return;
      clearLongPressTimeout();
      hideTooltip();
    },
    onContextMenu: () => {
      // Prevent iOS context menu after long-press so the tooltip feels native.
      clearLongPressTimeout();
    },
  };

  const child = Children.only(children) as ReactNode;

  const trigger = isValidElement(child) ? (
    (() => {
      const childEl = child as ReactElement<Record<string, unknown>>;
      const childProps = childEl.props ?? {};
      const existingDescribedBy = childProps["aria-describedby"];
      const mergedDescribedBy = [existingDescribedBy, open ? tooltipId : null]
        .filter(Boolean)
        .join(" ") || undefined;

      return cloneElement(childEl, {
        ...childProps,
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
          const childRef = (childEl as ReactElement & { ref?: unknown }).ref;
          if (typeof childRef === "function") childRef(node);
          else if (childRef && typeof childRef === "object" && "current" in childRef) {
            (childRef as { current: HTMLElement | null }).current = node;
          }
        },
        "aria-describedby": mergedDescribedBy,
        onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
          if (typeof childProps.onPointerEnter === "function") childProps.onPointerEnter(event);
          triggerProps.onPointerEnter(event);
        },
        onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
          if (typeof childProps.onPointerLeave === "function") childProps.onPointerLeave(event);
          triggerProps.onPointerLeave(event);
        },
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          if (typeof childProps.onPointerDown === "function") childProps.onPointerDown(event);
          triggerProps.onPointerDown(event);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
          if (typeof childProps.onPointerUp === "function") childProps.onPointerUp(event);
          triggerProps.onPointerUp(event);
        },
        onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
          if (typeof childProps.onPointerCancel === "function") childProps.onPointerCancel(event);
          triggerProps.onPointerCancel(event);
        },
        onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
          if (typeof childProps.onContextMenu === "function") childProps.onContextMenu(event);
          triggerProps.onContextMenu();
        },
      });
    })()
  ) : (
    <span className="inline-flex" {...triggerProps}>
      {children}
    </span>
  );

  return (
    <>
      {trigger}
      {mounted && open && content
        ? createPortal(
            <div
              id={tooltipId}
              ref={tooltipRef}
              role="tooltip"
              className="pointer-events-none fixed z-[100] max-w-[260px] rounded-md border border-border/80 bg-card px-3 py-2 text-xs leading-relaxed text-card-foreground shadow-xl"
              style={{
                left: position.left,
                top: position.top,
              }}
            >
              {content}
              <span
                className={
                  placement === "right"
                    ? "absolute top-1/2 -left-1 h-2 w-2 -translate-y-1/2 -translate-x-1/2 rotate-45 border border-border/80 bg-card border-r-0 border-t-0"
                    : "absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border border-border/80 bg-card"
                }
                style={
                  placement === "right"
                    ? undefined
                    : placement === "top"
                      ? { bottom: -5, borderLeft: "none", borderTop: "none" }
                      : { top: -5, borderRight: "none", borderBottom: "none" }
                }
                aria-hidden="true"
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
