import { useEffect, useState } from "react";
import { deriveFrame0Text } from "@shared/frame0Text";

type Props = {
  script: string;
};

/**
 * Read-only by default, click the overlay to edit it directly.
 * The initial suggestion always comes from the shared Frame 0 blueprint.
 */
export function Frame0TextPreview({ script }: Props) {
  const suggested = deriveFrame0Text(script);
  const [text, setText] = useState(suggested);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (edited) return;
    setText(suggested);
  }, [edited, suggested]);

  return (
    <div className="h-full overflow-y-auto px-7 py-6">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-5">
          <h3 className="text-base font-bold text-white">Frame 0 text</h3>
          <p className="mt-1 text-xs text-[#8f879f]">
            Use this as the on-screen text at the start of your video.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="relative aspect-[9/16] w-[300px] overflow-hidden rounded-[28px] border border-[#3a3450] bg-gradient-to-br from-violet-700 via-[#3b2858] to-[#121018] shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-black/10" />
            <textarea
              value={text}
              onChange={(event) => {
                setEdited(true);
                setText(event.target.value);
              }}
              onFocus={() => setEdited(true)}
              maxLength={90}
              aria-label="Frame 0 on-screen text"
              spellCheck
              className="absolute inset-x-5 top-1/2 min-h-[128px] -translate-y-1/2 resize-none overflow-hidden rounded-xl border border-transparent bg-black/20 p-3 text-[24px] font-extrabold leading-[1.08] text-white outline-none backdrop-blur-sm transition placeholder:text-white/40 focus:border-violet-300/50 focus:bg-black/30"
              placeholder="ADD YOUR FRAME 0 TEXT"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
