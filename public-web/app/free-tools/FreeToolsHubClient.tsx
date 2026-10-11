"use client";

import { useEffect, useState } from "react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { openHomepageAuth } from "../../lib/openHomepageAuth";
import {
  FILTERS,
  GO_VIRAL_BANNER,
  type ToolCategory,
} from "../../lib/freeToolsHub";
import styles from "./FreeToolsHub.module.css";

function FilterIcon({ id }: { id: ToolCategory }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (id) {
    case "all":
      return (
        <svg {...common}>
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      );
    case "finders":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "hooks":
      return (
        <svg {...common}>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        </svg>
      );
    case "broll":
      return (
        <svg {...common}>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 3v18" />
          <path d="M3 7.5h4" />
          <path d="M3 12h18" />
          <path d="M3 16.5h4" />
          <path d="M17 3v18" />
          <path d="M17 7.5h4" />
          <path d="M17 16.5h4" />
        </svg>
      );
    case "scripts":
    case "transcripts":
      return (
        <svg {...common}>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    default:
      return null;
  }
}

function openSignup() {
  openHomepageAuth({ mode: "signup", returnTo: "/research" });
}

export function FreeToolsFilterTabs() {
  const [filter, setFilter] = useState<ToolCategory>("all");

  useEffect(() => {
    const grid = document.getElementById("free-tools-grid");
    if (!grid) return;
    grid.setAttribute("data-active-filter", filter);
    for (const card of grid.querySelectorAll<HTMLElement>("[data-category]")) {
      const category = card.getAttribute("data-category");
      const visible = filter === "all" || category === filter;
      card.setAttribute("data-visible", visible ? "true" : "false");
    }
  }, [filter]);

  return (
    <div className={styles.filters} role="tablist" aria-label="Tool categories">
      {FILTERS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={filter === id}
          aria-label={label}
          title={label}
          className={styles.filterTab}
          onClick={() => setFilter(id)}
        >
          <FilterIcon id={id} />
        </button>
      ))}
    </div>
  );
}

export function FreeToolsGoViralBanner() {
  return (
    <section className={styles.bannerSection} aria-label="Go viral CTA">
      <button type="button" className={styles.bannerButton} onClick={openSignup}>
        <img
          src={GO_VIRAL_BANNER.src}
          alt={GO_VIRAL_BANNER.alt}
          width={GO_VIRAL_BANNER.width}
          height={GO_VIRAL_BANNER.height}
        />
      </button>
    </section>
  );
}

export function FreeToolsFaqStartFree() {
  return (
    <div className={styles.faqCta}>
      <PrimaryButton
        type="button"
        size="large"
        onClick={openSignup}
        data-marketing-primary-button="faq-start-free"
      >
        Start free
      </PrimaryButton>
    </div>
  );
}
