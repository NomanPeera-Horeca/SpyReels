"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BlogTocItem } from "../lib/blog/types";
import { BlogArticleIconChevronDown } from "./BlogArticleIcons";
import styles from "./MarketingTableOfContents.module.css";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Figma TOC row: Body Small 20px line + 12px gap. */
const TOC_ROW_STRIDE_PX = 32;

function readHeaderOffsetPx(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--sr-layout-marketing-header-height"
  );
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 77;
}

/**
 * Active section = last heading whose top is at or above the probe line
 * (header height + small content gap).
 */
function resolveActiveId(items: readonly BlogTocItem[], probeY: number): string {
  let current = items[0]?.id ?? "";
  for (const item of items) {
    const heading = document.getElementById(item.id);
    if (!heading) continue;
    if (heading.getBoundingClientRect().top <= probeY) {
      current = item.id;
    } else {
      break;
    }
  }
  return current;
}

export function MarketingTableOfContents({
  items,
  className,
}: {
  items: readonly BlogTocItem[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [barTop, setBarTop] = useState(0);
  const panelId = useId();
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const itemsKey = items.map((item) => item.id).join("|");

  useEffect(() => {
    if (items.length === 0) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let retryTimer: number | null = null;

    const updateActive = () => {
      if (cancelled) return;
      const probe = readHeaderOffsetPx() + 24;
      const next = resolveActiveId(items, probe);
      if (!next) return;
      setActiveId((prev) => (prev === next ? prev : next));
    };

    const observeHeadings = () => {
      const headings = items
        .map((item) => document.getElementById(item.id))
        .filter((el): el is HTMLElement => Boolean(el));
      if (headings.length === 0) return false;

      observer?.disconnect();
      observer = new IntersectionObserver(
        () => {
          updateActive();
        },
        {
          root: null,
          rootMargin: `-${readHeaderOffsetPx() + 24}px 0px -55% 0px`,
          threshold: [0, 0.25, 0.5, 0.75, 1],
        }
      );
      for (const heading of headings) {
        observer.observe(heading);
      }
      return true;
    };

    // Always bind scroll/resize. Resolve headings on each tick so we do not
    // miss listeners when the article hydrates after this effect first runs.
    updateActive();
    if (!observeHeadings()) {
      let attempts = 0;
      retryTimer = window.setInterval(() => {
        attempts += 1;
        if (observeHeadings() || attempts >= 40) {
          if (retryTimer != null) window.clearInterval(retryTimer);
          retryTimer = null;
          updateActive();
        }
      }, 50);
    }

    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    document.addEventListener("scroll", updateActive, { passive: true, capture: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (retryTimer != null) window.clearInterval(retryTimer);
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
      document.removeEventListener("scroll", updateActive, true);
    };
  }, [items, itemsKey]);

  useEffect(() => {
    const activeIndex = Math.max(
      0,
      items.findIndex((item) => item.id === activeId)
    );
    const el = itemRefs.current[activeIndex];
    if (el) {
      setBarTop(el.offsetTop + Math.max(0, (el.offsetHeight - 20) / 2));
    } else {
      setBarTop(activeIndex * TOC_ROW_STRIDE_PX);
    }
  }, [activeId, items, expanded]);

  if (items.length === 0) return null;

  return (
    <nav
      className={cx(styles.root, className)}
      aria-label="Table of contents"
      data-marketing-toc=""
      data-expanded={expanded ? "true" : "false"}
      data-active-section={activeId}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={cx("sr-text-marketing-label", styles.triggerLabel)}>In this article</span>
        <span className={styles.triggerSpacer} aria-hidden="true" />
        <BlogArticleIconChevronDown className={styles.chevron} />
      </button>

      <p className={cx("sr-text-marketing-label", styles.desktopLabel)}>On this page</p>

      <div className={styles.items} id={panelId}>
        <div className={styles.guide} aria-hidden="true">
          <span
            className={styles.activeBar}
            style={{ transform: `translateY(${barTop}px)` }}
          />
        </div>
        <ol className={styles.list}>
          {items.map((item, index) => {
            const isActive = item.id === activeId;
            return (
              <li
                key={item.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
              >
                <a
                  href={`#${item.id}`}
                  className={cx(
                    "sr-text-marketing-body-small",
                    styles.link,
                    isActive && styles.linkActive
                  )}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => setActiveId(item.id)}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
