/**
 * THROWAWAY: local visual proof for Remake workspace. Remove with route in App.tsx
 * when the product path is verified on Collected Reels.
 */
import { useState } from "react";
import { RemakeWorkspaceUiPreviewV2 } from "@/components/RemakeWorkspaceUiPreviewV2";

export default function DevRemakeWorkspacePreview() {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="min-h-screen bg-[#0c0b10] p-4 text-[#f3f0fa]"
      data-testid="dev-remake-workspace"
    >
      <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-[#2a2640] bg-[#1a1722] p-4 text-sm text-[#a39db8]">
        <strong className="text-[#f3f0fa]">Local Remake workspace preview v2</strong>
        <p className="mt-1">
          Product-design preview only. This keeps the current production Remake component untouched
          while we review the simplified Script → Visuals → Preview flow.
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

      {open ? <RemakeWorkspaceUiPreviewV2 onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
