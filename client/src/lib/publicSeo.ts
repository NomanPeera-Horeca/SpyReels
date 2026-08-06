import { DEFAULT_OG_IMAGE } from "../../../shared/defaultOgImage";

export const SPYREELS_SITE_URL = "https://spyreels.ai";

export const SPYREELS_LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

export function setMeta(prop: string, val: string, attr: "property" | "name" = "property") {
  if (typeof document === "undefined") return;
  let el = document.querySelector(`meta[${attr}="${prop}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, prop);
    document.head.appendChild(el);
  }
  el.setAttribute("content", val);
}

export function setPageDescription(content: string) {
  if (typeof document === "undefined") return;
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement("meta");
    metaDesc.setAttribute("name", "description");
    document.head.appendChild(metaDesc);
  }
  metaDesc.setAttribute("content", content);
}

export function removeSchemaScript(id: string) {
  document.getElementById(id)?.remove();
}

export function injectSchemaScript(id: string, data: Record<string, unknown>) {
  removeSchemaScript(id);
  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.text = JSON.stringify(data);
  document.head.appendChild(script);
}

export function cleanupSchemaScripts(ids: string[]) {
  ids.forEach(removeSchemaScript);
}

export function applyStandardPageMeta(options: {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType?: string;
  robots?: string;
  /** Optional override; defaults to `description`. */
  ogDescription?: string;
  twitterDescription?: string;
}) {
  const ogDescription = options.ogDescription ?? options.description;
  const twitterDescription =
    options.twitterDescription ?? options.ogDescription ?? options.description;
  document.title = options.title;
  setPageDescription(options.description);
  setMeta("og:title", options.title);
  setMeta("og:description", ogDescription);
  setMeta("og:image", DEFAULT_OG_IMAGE);
  setMeta("og:url", options.canonicalUrl);
  setMeta("og:type", options.ogType ?? "website");
  setMeta("twitter:card", "summary_large_image", "name");
  setMeta("twitter:title", options.title, "name");
  setMeta("twitter:description", twitterDescription, "name");
  setMeta("twitter:image", DEFAULT_OG_IMAGE, "name");
  setMeta("robots", options.robots ?? "index, follow", "name");
}
