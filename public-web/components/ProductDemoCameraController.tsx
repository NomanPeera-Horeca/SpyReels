"use client";

import { useEffect } from "react";

const MOBILE_MQ = "(max-width: 640px)";
const REDUCED_MQ = "(prefers-reduced-motion: reduce)";
const MAX_LOOPS = 2;
const SUCCESS_TRANSFORM = "translate(-266.3px, -101.09px) scale(0.7609)";

function isMobile() {
  return window.matchMedia(MOBILE_MQ).matches;
}

function prefersReduced() {
  return window.matchMedia(REDUCED_MQ).matches;
}

function animatedTree(root: HTMLElement) {
  return [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
}

function setPlayState(root: HTMLElement, camera: HTMLElement | null, state: string) {
  for (const el of animatedTree(root)) {
    el.style.animationPlayState = state;
  }
  if (camera) camera.style.animationPlayState = state;
}

function freezeSuccess(
  shell: HTMLElement,
  camera: HTMLElement | null,
  stage: HTMLElement
) {
  for (const el of animatedTree(shell)) {
    el.style.animationPlayState = "paused";
  }
  shell.querySelectorAll<HTMLElement>(".motion-scene").forEach((scene) => {
    scene.style.animation = "none";
    scene.style.opacity = scene.classList.contains("success-scene") ? "1" : "0";
  });
  const success = shell.querySelector(".success-scene");
  if (success) {
    success
      .querySelectorAll<HTMLElement>(
        ".success-mark, .success-message, .calendar-chip, .final-line"
      )
      .forEach((el) => {
        el.style.animation = "none";
        el.style.opacity = "1";
        el.style.transform = "none";
      });
  }
  if (camera) {
    camera.style.animation = "none";
    camera.style.transform = SUCCESS_TRANSFORM;
    camera.style.animationPlayState = "paused";
  }
  stage.setAttribute("data-product-demo-stopped", "true");
}

function initStage(stage: HTMLElement) {
  const camera = stage.querySelector<HTMLElement>(".product-demo-camera-scene");
  const shell = stage.querySelector<HTMLElement>(".motion-shell");
  if (!shell) return () => {};

  let loopsCompleted = 0;
  let userPaused = false;
  let offscreen = false;
  let stopped = false;

  function syncPlayback() {
    if (prefersReduced()) {
      stopped = true;
      freezeSuccess(shell!, camera, stage);
      stage.setAttribute("data-product-demo-reduced", "true");
      return;
    }
    if (!isMobile()) {
      setPlayState(shell!, camera, "running");
      stage.removeAttribute("data-product-demo-paused");
      return;
    }
    if (stopped) return;
    const playing = !userPaused && !offscreen;
    setPlayState(shell!, camera, playing ? "running" : "paused");
    if (userPaused) stage.setAttribute("data-product-demo-paused", "true");
    else stage.removeAttribute("data-product-demo-paused");
  }

  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      offscreen = !entry.isIntersecting;
      if (!isMobile() || prefersReduced() || stopped) return;
      syncPlayback();
    },
    { threshold: 0.2 }
  );
  io.observe(stage);

  const onClick = () => {
    if (!isMobile() || prefersReduced() || stopped) return;
    userPaused = !userPaused;
    syncPlayback();
  };
  stage.addEventListener("click", onClick);

  const searchScene = shell.querySelector(".search-scene");
  const onIteration = () => {
    if (!isMobile() || prefersReduced() || stopped) return;
    loopsCompleted += 1;
    if (loopsCompleted >= MAX_LOOPS) {
      stopped = true;
      freezeSuccess(shell, camera, stage);
    }
  };
  searchScene?.addEventListener("animationiteration", onIteration);

  const mobileMq = window.matchMedia(MOBILE_MQ);
  const reducedMq = window.matchMedia(REDUCED_MQ);
  const onEnvChange = () => syncPlayback();
  mobileMq.addEventListener("change", onEnvChange);
  reducedMq.addEventListener("change", onEnvChange);

  syncPlayback();

  return () => {
    io.disconnect();
    stage.removeEventListener("click", onClick);
    searchScene?.removeEventListener("animationiteration", onIteration);
    mobileMq.removeEventListener("change", onEnvChange);
    reducedMq.removeEventListener("change", onEnvChange);
  };
}

/** Mobile Product Demo camera: pause/resume, off-screen pause, max 2 loops. */
export function ProductDemoCameraController() {
  useEffect(() => {
    const cleanups = Array.from(
      document.querySelectorAll<HTMLElement>("[data-product-demo-camera]")
    ).map(initStage);
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return null;
}
