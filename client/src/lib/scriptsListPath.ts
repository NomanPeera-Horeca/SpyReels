import { savedScriptOpenPath } from "@/lib/scriptOpenPath";

export type ScriptsTagFilter = "all" | "untagged" | number;

/** Read tag filter from `/scripts` or `/scripts/:id` query string. */
export function parseScriptsTagFilter(searchString: string): ScriptsTagFilter {
  const params = new URLSearchParams(
    searchString.startsWith("?") ? searchString.slice(1) : searchString
  );
  const raw = params.get("tag");
  if (!raw) return "all";
  if (raw === "untagged") return "untagged";
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : "all";
}

export function scriptsListPath(filter: ScriptsTagFilter = "all"): string {
  if (filter === "all") return "/scripts";
  if (filter === "untagged") return "/scripts?tag=untagged";
  return `/scripts?tag=${filter}`;
}

/** Open script editor while preserving My Scripts list filter for back navigation. */
export function savedScriptOpenPathWithListContext(
  script: { id: number; coachScriptId?: number | null },
  tagFilter: ScriptsTagFilter
): string {
  const base = savedScriptOpenPath(script);
  if (tagFilter === "all") return base;
  const tagValue = tagFilter === "untagged" ? "untagged" : String(tagFilter);
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}tag=${tagValue}`;
}
