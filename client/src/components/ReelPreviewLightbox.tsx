import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  cycleModalTab,
  LIGHTBOX_FOCUSABLE_SELECTOR,
  lockBodyScroll,
} from "@/lib/lightboxA11y";

/**
 * Portrait preview shell already used when a grid video is enlarged.
 * Native fullscreen letterboxes vertical reels, so playback stays in this overlay.
 */
export function ReelPreviewLightbox({
  onClose,
  label = "Enlarged video preview",
  children,
}: {
  onClose: () => void;
  label?: string;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockBodyScroll(document.body);
    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(LIGHTBOX_FOCUSABLE_SELECTOR)
      );
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const next = cycleModalTab(items, active != null && items.includes(active) ? active : null, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      next.focus();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      unlockScroll();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="reel-preview-lightbox"
      onClick={() => onCloseRef.current()}
    >
      <div
        className="relative flex h-full max-h-[100dvh] w-full max-w-[min(100vw,calc(100dvh*9/16))] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          ref={closeRef}
          type="button"
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90"
          aria-label="Close enlarged video"
          title="Close"
          onClick={() => onCloseRef.current()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}
