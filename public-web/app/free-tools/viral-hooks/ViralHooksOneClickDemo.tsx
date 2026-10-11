"use client";

import { useEffect, useState } from "react";
import { PrimaryButton } from "../../../components/PrimaryButton";
import styles from "./ViralHooksDemos.module.css";

type Phase = "idle" | "clicking" | "hooked";

const BEFORE_SRC = "/marketing/viral-hooks/hook-mockup-before.png";

/**
 * Page-only demo: one tap overlays scroll-stopping on-screen hook text.
 * Tokens only (Figma Decision 39).
 */
export function ViralHooksOneClickDemo() {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    let cancelled = false;
    let clickTimer: number | undefined;
    let resetTimer: number | undefined;
    let loopTimer: number | undefined;

    const playOnce = () => {
      if (cancelled) return;
      setPhase("clicking");
      clickTimer = window.setTimeout(() => {
        if (cancelled) return;
        setPhase("hooked");
        resetTimer = window.setTimeout(() => {
          if (cancelled) return;
          setPhase("idle");
        }, 2800);
      }, 420);
    };

    playOnce();
    loopTimer = window.setInterval(playOnce, 4200);

    return () => {
      cancelled = true;
      window.clearTimeout(clickTimer);
      window.clearTimeout(resetTimer);
      window.clearInterval(loopTimer);
    };
  }, []);

  function playManual() {
    setPhase("clicking");
    window.setTimeout(() => setPhase("hooked"), 420);
    window.setTimeout(() => setPhase("idle"), 3200);
  }

  return (
    <div className={styles.demoWrap}>
      <div
        className={styles.phoneFrame}
        aria-label="Animated demo: one click adds on-screen hooks"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BEFORE_SRC}
          alt="Raw talking-head Reel before hook text"
          className={styles.phoneImage}
          width={720}
          height={1280}
        />
        <div className={styles.hookOverlay} aria-hidden>
          {(
            [
              { text: "this is how you", style: styles.lineSoft },
              { text: "GET", style: styles.lineWarn },
              { text: "10X", style: styles.lineSuccess },
              { text: "more VIEWS", style: styles.lineStrong },
            ] as const
          ).map((line, i) => (
            <div
              key={line.text}
              className={`${styles.hookLine} ${line.style} ${
                phase === "hooked" ? styles.hookLineVisible : ""
              }`}
              style={{
                transitionDelay: phase === "hooked" ? `${50 + i * 130}ms` : "0ms",
              }}
            >
              {line.text}
            </div>
          ))}
        </div>
        <div
          className={`${styles.tapRing} ${
            phase === "clicking" ? styles.tapRingActive : ""
          }`}
          aria-hidden
        />
        <div className={styles.demoCta}>
          <PrimaryButton type="button" size="medium" onClick={playManual}>
            {phase === "hooked" ? "Done" : "Generate hook"}
          </PrimaryButton>
        </div>
      </div>
      <p className={`sr-text-marketing-body-small ${styles.demoCaption}`}>
        <strong>One click</strong> · raw take to hooked captions
      </p>
    </div>
  );
}
