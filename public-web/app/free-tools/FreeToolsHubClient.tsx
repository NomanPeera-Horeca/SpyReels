"use client";

import { useEffect, useState } from "react";
import { MarketingTabRow } from "../../components/MarketingTabRow";
import { PrimaryButton } from "../../components/PrimaryButton";
import { openHomepageAuth } from "../../lib/openHomepageAuth";
import {
  FILTERS,
  GO_VIRAL_BANNER,
  type ToolCategory,
} from "../../lib/freeToolsHub";
import styles from "./FreeToolsHub.module.css";

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
    <MarketingTabRow
      className={styles.filters}
      tabs={FILTERS}
      active={filter}
      onChange={setFilter}
      aria-label="Tool categories"
    />
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
