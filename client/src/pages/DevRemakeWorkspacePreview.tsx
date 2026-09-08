/**
 * THROWAWAY: local visual proof for Remake workspace. Remove with route in App.tsx
 * when the product path is verified on Collected Reels.
 */
import { useState } from "react";
import { RemakeWorkspaceDialog } from "@/components/RemakeWorkspaceDialog";

const PREVIEW_SCRIPT = `Opening a restaurant with no experience. Bad idea. Right?

Okay. Fine. Let's do it.

You have no culinary school. No investor backing. No clue what a POS system even is.

And you're still sitting here googling "how to open a restaurant" at midnight.

Same. We did the same thing.

Here's what nobody tells you. Most successful restaurant owners started exactly where you are. Clueless. Passionate. A little bit broke.

The ones who make it learn fast. They hire people smarter than them. And they stop waiting until they feel ready.

Because ready never comes.

You figure out the permits while you're scared. You learn food cost math while you're losing money. You build the menu while people are already asking when you open.

The chaos doesn't go away. You just get better at moving through it.

Open the thing.`;

const PREVIEW_CAPTION = `You do not need to know everything before you start.

You need to learn faster than the problems arrive.

Save this if you're opening your first restaurant.`;

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
          This mounts the real Remake workspace component with local preview content. Log in and use
          the normal Remake flow to test live AI, saving, versions, and B-roll.
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
