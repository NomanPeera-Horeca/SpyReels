"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./ViralHooksDemos.module.css";

const BEFORE_SRC = "/marketing/viral-hooks/hook-mockup-before.png";
const AFTER_SRC = "/marketing/viral-hooks/hook-mockup-after.png";

/**
 * Page-only before/after slider. Tokens only.
 */
export function ViralHooksBeforeAfterSlider() {
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
    <div className={styles.sliderWrap}>
      <div
        ref={rootRef}
        className={styles.sliderFrame}
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BEFORE_SRC}
          alt="Before: raw talking-head Reel with no hook text"
          className={styles.phoneImage}
          draggable={false}
          width={720}
          height={1280}
        />
        <div
          className={styles.afterClip}
          style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={AFTER_SRC}
            alt="After: same Reel with viral on-screen hook text"
            className={styles.phoneImage}
            draggable={false}
            width={720}
            height={1280}
          />
        </div>
        <div className={styles.sliderBar} style={{ left: `${pct}%` }}>
          <span className={styles.sliderKnob} aria-hidden>
            ↔
          </span>
        </div>
        <span className={`sr-text-product-caption ${styles.badgeBefore}`}>
          Before
        </span>
        <span className={`sr-text-product-caption ${styles.badgeAfter}`}>
          After
        </span>
      </div>
      <p className={`sr-text-marketing-body-small ${styles.demoCaption}`}>
        Drag the slider · raw take vs hook with on-screen text
      </p>
    </div>
  );
}
