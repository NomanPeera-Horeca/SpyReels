import { useMemo } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { ScriptReaderWorkspace } from "@/components/ScriptReaderWorkspace";
import { parseScriptsTagFilter, scriptsListPath } from "@/lib/scriptsListPath";

/**
 * Library scripts open in a read-first workspace.
 * The route name is kept for backwards compatibility with saved Remake links,
 * but the reader supports every saved script and keeps the same saved_scripts row
 * as the source of truth for manual edits, AI edits, filming, and scheduling.
 */
export default function RemakeScriptWorkspace() {
  const [, params] = useRoute("/scripts/:id/remake");
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const scriptId = params?.id ? Number(params.id) : null;
  const backPath = useMemo(
    () => scriptsListPath(parseScriptsTagFilter(searchString)),
    [searchString]
  );

  if (scriptId == null || !Number.isFinite(scriptId)) {
    navigate(backPath, { replace: true });
    return null;
  }

  return <ScriptReaderWorkspace scriptId={scriptId} backPath={backPath} />;
}
