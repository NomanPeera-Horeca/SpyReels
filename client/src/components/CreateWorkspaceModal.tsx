import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCurrentWorkspaceId, trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const OPEN_CREATE_WORKSPACE_MODAL_EVENT = "open-create-workspace-modal";

const WORKSPACE_NAME_MIN = 1;
const WORKSPACE_NAME_MAX = 100;

function validateWorkspaceName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < WORKSPACE_NAME_MIN) {
    return "Workspace name is required.";
  }
  if (trimmed.length > WORKSPACE_NAME_MAX) {
    return `Workspace name must be ${WORKSPACE_NAME_MAX} characters or fewer.`;
  }
  return null;
}

export function CreateWorkspaceModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = trpc.workspaces.create.useMutation({
    onSuccess: data => {
      toast.success("Workspace created");
      setCurrentWorkspaceId(data.workspaceId);
      setOpen(false);
      // Scripts routes can reference workspace-scoped state (a specific script ID,
      // or a tag filter) that doesn't exist in the new workspace. Redirect to a
      // clean list instead of reloading the same URL, which previously produced
      // an empty list or a misleading "Script not found" after switching.
      const isScriptsRoute = window.location.pathname.startsWith("/scripts");
      if (isScriptsRoute) {
        window.location.href = "/scripts";
      } else {
        window.location.reload();
      }
    },
    onError: error => {
      setSubmitError(error.message);
    },
  });

  const resetForm = useCallback(() => {
    setName("");
    setValidationError(null);
    setSubmitError(null);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  useEffect(() => {
    const handleOpen = () => {
      resetForm();
      setOpen(true);
    };
    window.addEventListener(OPEN_CREATE_WORKSPACE_MODAL_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_CREATE_WORKSPACE_MODAL_EVENT, handleOpen);
    };
  }, [resetForm]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const error = validateWorkspaceName(name);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    createMutation.mutate({ name: name.trim() });
  };

  const isPending = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create new workspace</DialogTitle>
          <DialogDescription>
            A workspace lets you collaborate with your team on scripts, saved
            reels, and research.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              placeholder="e.g. Acme Agency"
              value={name}
              maxLength={WORKSPACE_NAME_MAX}
              disabled={isPending}
              onChange={event => {
                setName(event.target.value);
                if (validationError) {
                  setValidationError(null);
                }
                if (submitError) {
                  setSubmitError(null);
                }
              }}
              autoFocus
            />
            {validationError ? (
              <p className="text-sm text-destructive">{validationError}</p>
            ) : null}
            {submitError ? (
              <p className="text-sm text-destructive">{submitError}</p>
            ) : null}
          </div>
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
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
