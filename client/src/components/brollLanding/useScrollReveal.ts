import { useEffect } from "react";

/** IntersectionObserver scroll-reveal for `.reveal` nodes inside the landing root. */
export function useScrollReveal(rootSelector = ".broll-landing") {
  useEffect(() => {
    const root = document.querySelector(rootSelector);
    if (!root) return;
    const revealables = root.querySelectorAll(".reveal");
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealables.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    revealables.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootSelector]);
}
