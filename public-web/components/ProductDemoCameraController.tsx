"use client";

import { useEffect } from "react";

/**
 * Ensures the deferred camera driver boots after client navigations
 * (finder pages). Homepage also loads /marketing/product-demo-camera.js
 * via a classic defer script in the HTML segment.
 */
export function ProductDemoCameraController() {
  useEffect(() => {
    const w = window as Window & { __spyreelsProductDemoCameraBoot?: () => void };
    if (typeof w.__spyreelsProductDemoCameraBoot === "function") {
      w.__spyreelsProductDemoCameraBoot();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="/marketing/product-demo-camera.js"]'
    );
    if (existing) return;
    const script = document.createElement("script");
    script.src = "/marketing/product-demo-camera.js";
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  return null;
}
