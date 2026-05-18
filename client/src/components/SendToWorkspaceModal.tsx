import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentWorkspaceId, trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const OPEN_SEND_TO_WORKSPACE_EVENT = "open-send-to-workspace";

export type SendToWorkspaceDetail = {
  scriptId: number;
  scriptTitle: string;
};

function getWorkspaceLabel(name: string, isPersonal: boolean): string {
  return isPersonal ? "Personal" : name;
}

export function openSendToWorkspaceModal(detail: SendToWorkspaceDetail): void {
  window.dispatchEvent(
    new CustomEvent<SendToWorkspaceDetail>(OPEN_SEND_TO_WORKSPACE_EVENT, {
      detail,
    })
  );
}

export function SendToWorkspaceModal() {
  const [open, setOpen] = useState(false);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [scriptTitle, setScriptTitle] = useState("");
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentWorkspaceId = getCurrentWorkspaceId();
  const utils = trpc.useUtils();

  const workspacesQuery = trpc.workspaces.list.useQuery(undefined, {
    enabled: open,
  });

  const targetWorkspaces = useMemo(() => {
    const rows = workspacesQuery.data ?? [];
    return rows.filter(w => w.id !== currentWorkspaceId);
  }, [workspacesQuery.data, currentWorkspaceId]);

  const sendMutation = trpc.scripts.sendToWorkspace.useMutation({
    onSuccess: data => {
      toast.success(`Script sent to ${data.targetWorkspaceName}`);
      void utils.scripts.list.invalidate();
      setOpen(false);
    },
    onError: error => {
      setSubmitError(error.message);
    },
  });

  const resetForm = useCallback(() => {
    setScriptId(null);
    setScriptTitle("");
    setTargetWorkspaceId("");
    setNote("");
    setSubmitError(null);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  };

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<SendToWorkspaceDetail>;
      if (!custom.detail?.scriptId) return;
      resetForm();
      setScriptId(custom.detail.scriptId);
      setScriptTitle(custom.detail.scriptTitle);
      setOpen(true);
    };
    window.addEventListener(OPEN_SEND_TO_WORKSPACE_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_SEND_TO_WORKSPACE_EVENT, handleOpen);
    };
  }, [resetForm]);

  useEffect(() => {
    if (!open || targetWorkspaceId || targetWorkspaces.length === 0) return;
    setTargetWorkspaceId(targetWorkspaces[0].id);
  }, [open, targetWorkspaceId, targetWorkspaces]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (scriptId == null) return;
    if (!targetWorkspaceId) {
      setSubmitError("Select a workspace to send to.");
      return;
    }
    sendMutation.mutate({
      scriptId,
      targetWorkspaceId,
      note: note.trim() || undefined,
    });
  };

  const isPending = sendMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to workspace</DialogTitle>
          <DialogDescription>
            {scriptTitle
              ? `Send "${scriptTitle}" to another workspace. A copy stays in this workspace.`
              : "Send a copy of this script to another workspace."}
          </DialogDescription>
        </DialogHeader>

        {workspacesQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : targetWorkspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You do not have another workspace to send to. Create a team workspace
            from the sidebar switcher first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-workspace">Send this script to:</Label>
              <Select
                value={targetWorkspaceId}
                onValueChange={setTargetWorkspaceId}
                disabled={isPending}
              >
                <SelectTrigger id="target-workspace" className="w-full">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {targetWorkspaces.map(workspace => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {getWorkspaceLabel(workspace.name, workspace.isPersonal)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sender-note">Add a note for the team (optional)</Label>
              <Textarea
                id="sender-note"
                placeholder="Context for your team..."
                value={note}
                maxLength={2000}
                rows={3}
                disabled={isPending}
                onChange={event => setNote(event.target.value)}
              />
            </div>

            {submitError ? (
              <p className="text-sm text-destructive">{submitError}</p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {targetWorkspaces.length === 0 ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
