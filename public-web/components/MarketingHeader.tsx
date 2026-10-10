"use client";

import { useEffect, useRef } from "react";
import { DarkButton } from "./DarkButton";
import { MarketingIconClose, MarketingIconMenu } from "./MarketingIcons";
import {
  HOME_HREF,
  LOGIN_HREF,
  LOGO_MARK_SRC,
  NAV_MENUS,
  PRICING_HREF,
  SIGNUP_HREF,
  type MegaItem,
  type NavMenu,
} from "./marketingNavData";

function NavChevron() {
  return (
    <svg className="nav-chevron" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="m2.5 4.5 3.5 3 3.5-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MegaLink({ item }: { item: MegaItem }) {
  return (
    <a className="mega-link" href={item.href}>
      <span className={`mega-icon ${item.iconClass ?? ""}`} aria-hidden="true">
        {item.icon}
      </span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.description}</small>
      </span>
    </a>
  );
}

function NavChoice({ item }: { item: MegaItem }) {
  return (
    <a className="nav-choice" href={item.href}>
      <span className={`mega-icon ${item.iconClass ?? ""}`} aria-hidden="true">
        {item.icon}
      </span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.description}</small>
      </span>
    </a>
  );
}

function MenuPanel({ menu }: { menu: NavMenu }) {
  if (menu.sections) {
    return (
      <div className={`mega ${menu.panelClass}`} aria-label={menu.panelAriaLabel}>
        {menu.sections.map((section) => (
          <div className="product-section" key={section.label}>
            <span className="nav-panel-label">{section.label}</span>
            <div className="product-section-grid">
              {section.items.map((item) => (
                <MegaLink item={item} key={`${item.href}-${item.title}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const linkClass = menu.id === "solutions" ? "nav-role" : "nav-choice";
  return (
    <div className={`mega ${menu.panelClass}`} aria-label={menu.panelAriaLabel}>
      <span className="nav-panel-label">{menu.panelLabel}</span>
      <div className="nav-panel-list">
        {menu.items?.map((item) =>
          linkClass === "nav-role" ? (
            <a className="nav-role" href={item.href} key={`${item.href}-${item.title}`}>
              <span className={`mega-icon ${item.iconClass ?? ""}`} aria-hidden="true">
                {item.icon}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </a>
          ) : (
            <NavChoice item={item} key={`${item.href}-${item.title}`} />
          )
        )}
      </div>
    </div>
  );
}

/**
 * Marketing / Header — Responsive v1.0 (Figma Page 09).
 * Keeps live link labels/hrefs; Button / Dark Start free; Icon Menu/Close.
 */
export function MarketingHeader() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const navInner = rootRef.current?.querySelector<HTMLElement>("#nav-inner");
    const menuToggle = rootRef.current?.querySelector<HTMLButtonElement>("#menu-toggle");
    if (!navInner || !menuToggle) return;

    const navMenus = [...navInner.querySelectorAll<HTMLDetailsElement>(".nav-menu")];
    const hoverTimers = new WeakMap<HTMLDetailsElement, { open?: number; close?: number }>();

    const clearHover = (menu: HTMLDetailsElement) => {
      const timers = hoverTimers.get(menu);
      if (timers?.open) window.clearTimeout(timers.open);
      if (timers?.close) window.clearTimeout(timers.close);
    };

    const closeNav = () => {
      navMenus.forEach((menu) => {
        menu.open = false;
      });
      navInner.classList.remove("menu-open");
      menuToggle.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
    };

    const onToggleClick = () => {
      const open = navInner.classList.toggle("menu-open");
      menuToggle.classList.toggle("open", open);
      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    };

    const onPointerDownDoc = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        document.body.dataset.navInput = "pointer";
      }
      if (!navInner.contains(event.target as Node)) closeNav();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (["Tab", "Enter", " ", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        document.body.dataset.navInput = "keyboard";
      }
      if (event.key !== "Escape") return;
      const opener = navMenus.find((menu) => menu.open)?.querySelector("summary");
      const inside = navInner.contains(document.activeElement);
      closeNav();
      if (inside) {
        const mobile = window.matchMedia("(max-width: 1100px)").matches;
        (mobile ? menuToggle : opener)?.focus();
      }
    };

    menuToggle.addEventListener("click", onToggleClick);
    document.addEventListener("pointerdown", onPointerDownDoc, true);
    document.addEventListener("keydown", onKeyDown, true);

    const summaryCleanups: Array<() => void> = [];
    navMenus.forEach((menu) => {
      const summary = menu.querySelector("summary");
      if (summary) {
        const onSummaryPointerUp = (event: PointerEvent) => {
          if (event.pointerType === "mouse") {
            requestAnimationFrame(() => (event.currentTarget as HTMLElement).blur());
          }
        };
        summary.addEventListener("pointerup", onSummaryPointerUp);
        summaryCleanups.push(() => summary.removeEventListener("pointerup", onSummaryPointerUp));
      }

      const onToggle = () => {
        if (menu.open) {
          navMenus.forEach((other) => {
            if (other !== menu) other.open = false;
          });
        }
      };
      menu.addEventListener("toggle", onToggle);
      summaryCleanups.push(() => menu.removeEventListener("toggle", onToggle));

      const onEnter = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || window.matchMedia("(max-width: 1100px)").matches) return;
        clearHover(menu);
        hoverTimers.set(menu, {
          open: window.setTimeout(() => {
            menu.open = true;
          }, 100),
        });
      };
      const onLeave = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || window.matchMedia("(max-width: 1100px)").matches) return;
        clearHover(menu);
        hoverTimers.set(menu, {
          close: window.setTimeout(() => {
            menu.open = false;
          }, 250),
        });
      };
      menu.addEventListener("pointerenter", onEnter);
      menu.addEventListener("pointerleave", onLeave);
      summaryCleanups.push(() => {
        menu.removeEventListener("pointerenter", onEnter);
        menu.removeEventListener("pointerleave", onLeave);
      });
    });

    const linkCleanups: Array<() => void> = [];
    navInner.querySelectorAll<HTMLAnchorElement>(".nav-links a").forEach((link) => {
      const onClick = () => closeNav();
      link.addEventListener("click", onClick);
      linkCleanups.push(() => link.removeEventListener("click", onClick));
    });

    const mq = window.matchMedia("(min-width: 1101px)");
    const onMq = () => closeNav();
    mq.addEventListener("change", onMq);

    return () => {
      menuToggle.removeEventListener("click", onToggleClick);
      document.removeEventListener("pointerdown", onPointerDownDoc, true);
      document.removeEventListener("keydown", onKeyDown, true);
      mq.removeEventListener("change", onMq);
      summaryCleanups.forEach((fn) => fn());
      linkCleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <header className="nav" data-marketing-header ref={rootRef}>
      <div className="shell nav-inner" id="nav-inner">
        <a className="brand" href={HOME_HREF} aria-label="SpyReels home">
          <span className="mark">
            <img src={LOGO_MARK_SRC} alt="" width={36} height={36} />
          </span>
          SpyReels
        </a>
        <nav className="nav-links" aria-label="Primary">
          {NAV_MENUS.map((menu) => (
            <details className={`nav-menu ${menu.menuClass}`} key={menu.id}>
              <summary>
                {menu.label}
                <NavChevron />
              </summary>
              <MenuPanel menu={menu} />
            </details>
          ))}
          <a className="plain-nav" href={PRICING_HREF}>
            Pricing
          </a>
        </nav>
        <div className="nav-actions">
          <a className="btn btn-ghost" href={LOGIN_HREF}>
            Log in
          </a>
          <DarkButton href={SIGNUP_HREF} data-marketing-dark-button="start-free">
            Start free
          </DarkButton>
        </div>
        <button
          className="menu-toggle"
          id="menu-toggle"
          type="button"
          aria-label="Open navigation"
          aria-expanded="false"
        >
          <MarketingIconMenu className="menu-toggle-icon menu-toggle-icon-open" />
          <MarketingIconClose className="menu-toggle-icon menu-toggle-icon-close" />
        </button>
      </div>
    </header>
  );
}
