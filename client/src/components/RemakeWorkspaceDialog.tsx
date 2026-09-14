import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import {
  RemakeWorkspaceDialog as RemakeWorkspaceDialogAgenticV2,
  type RemakeWorkspaceTarget,
} from "@/components/RemakeWorkspaceDialogAgenticV2";
import { ExclusiveTeleprompterSurface } from "@/components/ExclusiveTeleprompterSurface";
import { trpc } from "@/lib/trpc";
import {
  REMAKE_WORKSPACE_BODY_ATTR,
  REMAKE_WORKSPACE_OPEN_EVENT,
} from "@/lib/remakeWorkspaceEvents";

export type { RemakeWorkspaceTarget };

type Props = ComponentProps<typeof RemakeWorkspaceDialogAgenticV2>;

export function RemakeWorkspaceDialog(props: Props) {
  const [teleprompterScriptId, setTeleprompterScriptId] = useState<number | null>(null);

  const teleprompterQuery = trpc.scripts.get.useQuery(
    { id: teleprompterScriptId ?? 0 },
    {
      enabled: props.open && teleprompterScriptId != null,
      staleTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  const teleprompterScript = useMemo(
    () => teleprompterQuery.data?.content?.trim() ?? "",
    [teleprompterQuery.data?.content]
  );

  useEffect(() => {
    if (!props.open || typeof window === "undefined") return;

    document.body.setAttribute(REMAKE_WORKSPACE_BODY_ATTR, "true");
    window.dispatchEvent(new Event(REMAKE_WORKSPACE_OPEN_EVENT));

    return () => {
      document.body.removeAttribute(REMAKE_WORKSPACE_BODY_ATTR);
    };
  }, [props.open, props.target?.remakeKey]);

  useEffect(() => {
    if (!props.open) setTeleprompterScriptId(null);
  }, [props.open]);

  useEffect(() => {
    if (teleprompterScriptId == null) return;
    if (teleprompterQuery.isError) {
      toast.error("Could not open teleprompter");
      setTeleprompterScriptId(null);
      return;
    }
    if (teleprompterQuery.isSuccess && !teleprompterScript) {
      toast.error("This script is empty");
      setTeleprompterScriptId(null);
    }
  }, [
    teleprompterQuery.isError,
    teleprompterQuery.isSuccess,
    teleprompterScript,
    teleprompterScriptId,
  ]);

  return (
    <>
      <RemakeWorkspaceDialogAgenticV2
        {...props}
        onOpenTeleprompter={(_reelId, scriptId) => {
          setTeleprompterScriptId(scriptId);
        }}
      />

      {teleprompterScriptId != null ? (
        <ExclusiveTeleprompterSurface
          script={teleprompterScript || null}
          loading={teleprompterQuery.isPending || teleprompterQuery.isFetching}
          onClose={() => setTeleprompterScriptId(null)}
        />
      ) : null}
    </>
  );
}
