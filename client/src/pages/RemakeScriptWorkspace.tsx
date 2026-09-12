import { useEffect, useMemo } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { RemakeWorkspaceDialog } from "@/components/RemakeWorkspaceDialog";
import { trpc } from "@/lib/trpc";
import { parseScriptsTagFilter, scriptsListPath } from "@/lib/scriptsListPath";

export default function RemakeScriptWorkspace() {
  const [, params] = useRoute("/scripts/:id/remake");
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const scriptId = params?.id ? Number(params.id) : null;
  const backPath = useMemo(
    () => scriptsListPath(parseScriptsTagFilter(searchString)),
    [searchString]
  );

  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId ?? 0 },
    {
      enabled: scriptId != null && Number.isFinite(scriptId),
      staleTime: 10_000,
      retry: false,
    }
  );

  const script = scriptQuery.data as
    | ({
        id: number;
        reelId?: number | null;
        recreatedScriptId?: number | null;
      } & Record<string, unknown>)
    | undefined;

  useEffect(() => {
    if (!script || script.recreatedScriptId != null) return;
    navigate(`/scripts/${script.id}`, { replace: true });
  }, [navigate, script]);

  if (scriptId == null || !Number.isFinite(scriptId)) {
    navigate(backPath, { replace: true });
    return null;
  }

  if (scriptQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening Remake workspace...
      </div>
    );
  }

  if (scriptQuery.isError || !script) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-base font-semibold">Could not open this Remake</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The saved script could not be loaded. Return to My Scripts and try again.
          </p>
          <button
            type="button"
            onClick={() => navigate(backPath, { replace: true })}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Back to My Scripts
          </button>
        </div>
      </div>
    );
  }

  if (script.recreatedScriptId == null) return null;

  return (
    <div className="min-h-[70vh]" data-testid="saved-remake-workspace">
      <RemakeWorkspaceDialog
        open
        onOpenChange={(next) => {
          if (!next) navigate(backPath, { replace: true });
        }}
        target={{
          scriptId: script.id,
          reelId: script.reelId ?? null,
          remakeKey: `saved-remake:${script.id}`,
          source: null,
        }}
        remakeState={{
          stage: "ready",
          progressPercent: 100,
          scriptId: script.id,
          reelId: script.reelId ?? undefined,
        }}
      />
    </div>
  );
}
