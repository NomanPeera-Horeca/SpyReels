import { useState } from "react";
import { SourceReelCard, type SourceReelView } from "@/components/SourceReelCard";
import { SourceReelModal } from "@/components/SourceReelModal";

/** Compact source reel card plus fullscreen modal (Script Editor V1.7). */
export function ScriptEditorSourceReel({
  sourceReel,
  className,
}: {
  sourceReel: SourceReelView;
  className?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <SourceReelCard
        sourceReel={sourceReel}
        onExpand={() => setModalOpen(true)}
        className={className}
      />
      <SourceReelModal
        sourceReel={sourceReel}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
