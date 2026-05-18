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
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Copy, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const OPEN_SHARE_LINK_MODAL_EVENT = "open-share-link-modal";

export type ShareLinkModalDetail = {
  scriptId: number;
  scriptTitle?: string;
};

function formatViewCount(count: number): string {
  if (count === 1) return "1 view";
  return `${count} views`;
}

function formatLastViewed(at: Date | string | null): string | null {
  if (!at) return null;
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return `Last viewed ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)}`;
}

export function openShareLinkModal(detail: ShareLinkModalDetail): void {
  window.dispatchEvent(
    new CustomEvent<ShareLinkModalDetail>(OPEN_SHARE_LINK_MODAL_EVENT, { detail })
  );
}

export function ShareLinkModal() {
  const [open, setOpen] = useState(false);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [scriptTitle, setScriptTitle] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState(0);
  const [lastViewedAt, setLastViewedAt] = useState<Date | string | null>(null);
  const [linkEnabled, setLinkEnabled] = useState(false);

  const utils = trpc.useUtils();

  const shareInfoQuery = trpc.scripts.getShareLinkInfo.useQuery(
    { scriptId: scriptId ?? 0 },
    { enabled: open && scriptId != null }
  );

  const createMutation = trpc.scripts.createShareLink.useMutation({
    onSuccess: data => {
      setShareUrl(data.url);
      setLinkEnabled(true);
      setSubmitError(null);
      void utils.scripts.getShareLinkInfo.invalidate({ scriptId: scriptId ?? 0 });
    },
    onError: error => setSubmitError(error.message),
  });

  const revokeMutation = trpc.scripts.revokeShareLink.useMutation({
    onSuccess: () => {
      setShareUrl(null);
      setLinkEnabled(false);
      setViewCount(0);
      setLastViewedAt(null);
      setSubmitError(null);
      void utils.scripts.getShareLinkInfo.invalidate({ scriptId: scriptId ?? 0 });
    },
    onError: error => setSubmitError(error.message),
  });

  const resetState = useCallback(() => {
    setScriptId(null);
    setScriptTitle("");
    setSubmitError(null);
    setShareUrl(null);
    setViewCount(0);
    setLastViewedAt(null);
    setLinkEnabled(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetState();
  };

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<ShareLinkModalDetail>;
      if (!custom.detail?.scriptId) return;
      resetState();
      setScriptId(custom.detail.scriptId);
      setScriptTitle(custom.detail.scriptTitle ?? "");
      setOpen(true);
    };
    window.addEventListener(OPEN_SHARE_LINK_MODAL_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_SHARE_LINK_MODAL_EVENT, handleOpen);
    };
  }, [resetState]);

  useEffect(() => {
    if (!open || !shareInfoQuery.data) return;
    const info = shareInfoQuery.data;
    if (!info) {
      setLinkEnabled(false);
      setShareUrl(null);
      return;
    }
    setLinkEnabled(info.isActive);
    if (info.isActive) {
      setShareUrl(info.url);
      setViewCount(info.viewCount);
      setLastViewedAt(info.lastViewedAt);
    } else {
      setShareUrl(null);
    }
  }, [open, shareInfoQuery.data]);

  const isBusy =
    shareInfoQuery.isLoading ||
    createMutation.isPending ||
    revokeMutation.isPending;

  const handleToggle = (enabled: boolean) => {
    if (scriptId == null) return;
    setSubmitError(null);
    if (enabled) {
      createMutation.mutate({ scriptId });
    } else {
      revokeMutation.mutate({ scriptId });
    }
  };

  const handleRevoke = () => {
    if (scriptId == null) return;
    setSubmitError(null);
    revokeMutation.mutate({ scriptId });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const lastViewedLabel = formatLastViewed(lastViewedAt);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            {scriptTitle
              ? `Anyone with the link can view "${scriptTitle}" without signing in.`
              : "Anyone with the link can view this script without signing in."}
          </DialogDescription>
        </DialogHeader>

        {shareInfoQuery.isLoading && scriptId != null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
              <Label htmlFor="enable-public-link" className="text-sm font-medium">
                Enable public link
              </Label>
              <Switch
                id="enable-public-link"
                checked={linkEnabled}
                disabled={isBusy || scriptId == null}
                onCheckedChange={handleToggle}
              />
            </div>

            {linkEnabled && shareUrl ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="share-url">Public URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="share-url"
                      readOnly
                      value={shareUrl}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="shrink-0"
                      onClick={handleCopy}
                      aria-label="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatViewCount(viewCount)}
                  {lastViewedLabel ? ` · ${lastViewedLabel}` : ""}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isBusy}
                  onClick={handleRevoke}
                >
                  Revoke link
                </Button>
              </div>
            ) : null}

            {submitError ? (
              <p className="text-sm text-destructive">{submitError}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
