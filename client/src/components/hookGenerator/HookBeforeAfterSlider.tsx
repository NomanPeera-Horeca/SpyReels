import { useCallback, useRef, useState } from "react";
import hookBeforePng from "@/assets/hook-generator/hook-mockup-before.png";
import hookAfterPng from "@/assets/hook-generator/hook-mockup-after.png";

/**
 * Drag slider comparing raw take vs hooked on-screen text.
 */
export function HookBeforeAfterSlider() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(50);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.max(4, Math.min(96, next)));
  }, []);

  return (
    <div className="mx-auto mt-6 w-full max-w-md">
      <div
        ref={rootRef}
        className="relative aspect-[9/16] max-h-[520px] w-full cursor-ew-resize touch-none overflow-hidden rounded-2xl border border-white/10 bg-black select-none"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Drag to compare before and after"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPct((p) => Math.max(4, p - 4));
          if (e.key === "ArrowRight") setPct((p) => Math.min(96, p + 4));
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          setFromClientX(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <img
          src={hookBeforePng}
          alt="Before: raw talking-head Reel with no hook text"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          width={720}
          height={1280}
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
        >
          <img
            src={hookAfterPng}
            alt="After: same Reel with viral on-screen hook text"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            width={720}
            height={1280}
          />
        </div>
        <div
          className="absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_12px_rgba(139,92,246,0.8)]"
          style={{ left: `${pct}%` }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-xs font-bold text-white shadow-lg">
            ↔
          </div>
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">
          Before
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-violet-600/90 px-2.5 py-1 text-[11px] font-bold text-white">
          After
        </span>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Drag the slider · raw take vs hook with on-screen text
      </p>
    </div>
  );
}
