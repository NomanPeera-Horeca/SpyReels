"use client";

import { useEffect, useState } from "react";
import { PrimaryButton } from "../../components/PrimaryButton";
import {
  MarketingIconBroll,
  MarketingIconFinder,
  MarketingIconHooks,
  MarketingIconScript,
} from "../../components/MarketingIcons";
import { openHomepageAuth } from "../../lib/openHomepageAuth";
import {
  FILTERS,
  GO_VIRAL_BANNER,
  type ToolCategory,
} from "../../lib/freeToolsHub";
import styles from "./FreeToolsHub.module.css";

/** Kept as-is: no shared MarketingIcon for "all tools". */
function FilterIconAll() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

/** Kept as-is: no shared MarketingIcon for transcripts. */
function FilterIconTranscripts() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function FilterIcon({ id }: { id: ToolCategory }) {
  switch (id) {
    case "all":
      return <FilterIconAll />;
    case "finders":
      return <MarketingIconFinder aria-hidden="true" />;
    case "hooks":
      return <MarketingIconHooks aria-hidden="true" />;
    case "broll":
      return <MarketingIconBroll aria-hidden="true" />;
    case "scripts":
      return <MarketingIconScript aria-hidden="true" />;
    case "transcripts":
      return <FilterIconTranscripts />;
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
    <button type="button" className={styles.bannerButton} onClick={openSignup}>
      <img
        src={GO_VIRAL_BANNER.src}
        alt={GO_VIRAL_BANNER.alt}
        width={GO_VIRAL_BANNER.width}
        height={GO_VIRAL_BANNER.height}
      />
    </button>
  );
}

export function FreeToolsFaqStartFree() {
  return (
    <PrimaryButton
      type="button"
      size="large"
      onClick={openSignup}
      data-marketing-primary-button="faq-start-free"
    >
      Start free
    </PrimaryButton>
  );
}
