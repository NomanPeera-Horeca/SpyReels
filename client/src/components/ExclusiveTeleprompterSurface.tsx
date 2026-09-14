import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";
import { TeleprompterMode } from "@/pages/TeleprompterMode";

type Props = {
  script: string | null;
  loading: boolean;
  onClose: () => void;
};

/**
 * Gives Film Mode exclusive focus without unmounting the Remake workspace.
 *
 * The Remake editor stays mounted underneath so draft state, selection,
 * history, and autosave lifecycle are preserved. Radix owns the modal/focus
 * stack, while this surface renders above the workspace as the only active UI.
 */
export function ExclusiveTeleprompterSurface({ script, loading, onClose }: Props) {
  return (
    <DialogPrimitive.Root
      open
      modal
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[100] overflow-hidden bg-black p-0 outline-none"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Film Mode teleprompter</DialogPrimitive.Title>
          {loading || !script ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black text-white">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-sm font-medium text-white/75">Preparing Film Mode...</p>
            </div>
          ) : (
            <TeleprompterMode script={script} onClose={onClose} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
