import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="reel-preview-lightbox"
      onClick={onClose}
    >
      <div
        className="relative flex h-full max-h-[100dvh] w-full max-w-[min(100vw,calc(100dvh*9/16))] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          type="button"
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90"
          aria-label="Close enlarged video"
          title="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}
