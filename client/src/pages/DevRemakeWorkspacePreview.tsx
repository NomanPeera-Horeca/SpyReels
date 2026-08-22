/**
 * THROWAWAY: local visual proof for Remake workspace. Remove with route in App.tsx
 * when the product path is verified on Collected Reels.
 */
import { useState } from "react";
import { RemakeWorkspaceDialog } from "@/components/RemakeWorkspaceDialog";

const PREVIEW_SCRIPT = `[HOOK] Stop designing your menu before you understand your kitchen.

[BODY] Most restaurant owners spend weeks on menu design, then discover the prep station cannot keep up. Walk the kitchen path first. Time how long it takes to plate one dish during a rush. Fix the bottlenecks, then design the menu around what your kitchen can actually deliver.

[CTA] Comment KITCHEN and I will send you the free layout checklist.`;

const PREVIEW_CAPTION = `Your kitchen layout is the silent profit killer.

Walk the path before you redesign the menu.

Comment KITCHEN for the checklist.

#restaurants #kitchenops #foodbusiness`;

export default function DevRemakeWorkspacePreview() {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="min-h-screen bg-[#0c0b10] p-4 text-[#f3f0fa]"
      data-testid="dev-remake-workspace"
    >
      <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-[#2a2640] bg-[#1a1722] p-4 text-sm text-[#a39db8]">
        <strong className="text-[#f3f0fa]">Local Remake workspace preview</strong>
        <p className="mt-1">
          This mounts the real React component (not the HTML mockup). Log in and use Collected
          Reels → Remake for the live generate path. AI save calls need a real script id.
        </p>
        {!open ? (
          <button
            type="button"
            className="mt-3 rounded-lg bg-[#7c3aed] px-4 py-2 font-semibold text-white"
            onClick={() => setOpen(true)}
          >
            Reopen workspace
          </button>
        ) : null}
      </div>

      <RemakeWorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        target={{ scriptId: null, reelId: null, remakeKey: "dev-preview" }}
        remakeState={{ stage: "ready", progressPercent: 100 }}
        previewSeed={{ script: PREVIEW_SCRIPT, caption: PREVIEW_CAPTION }}
      />
    </div>
  );
}
