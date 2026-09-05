import { useRef } from "react";
import {
  CAROUSEL_IMAGE_ZOOM_MAX,
  CAROUSEL_IMAGE_ZOOM_MIN,
  type CarouselImageFrameOverride,
  type CarouselImageFramePatch,
} from "@shared/carouselImageFrame";

type CarouselImageInspectorProps = {
  slotId: string;
  imageUrl: string;
  frame: CarouselImageFrameOverride | undefined;
  regenerating?: boolean;
  onReplaceFile: (file: File) => void;
  onRegenerate?: () => void;
  onFrameChange: (patch: CarouselImageFramePatch) => void;
};

export function CarouselImageInspector({
  slotId,
  imageUrl,
  frame,
  regenerating = false,
  onReplaceFile,
  onRegenerate,
  onFrameChange,
}: CarouselImageInspectorProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const posX = frame?.posX ?? 50;
  const posY = frame?.posY ?? 50;
  const zoom = frame?.zoom ?? 1;

  return (
    <aside className="panel inspector-panel" aria-label="Image">
      <div className="text-inspector">
        <div className="panel-head">
          <strong>Image</strong>
          <span className="text-inspector-role">Slot {slotId}</span>
        </div>
        <div className="text-inspector-body">
          <div
            className="image-inspector-preview"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onReplaceFile(file);
            }}
          />
          <button
            type="button"
            className="btn small"
            onClick={() => fileRef.current?.click()}
          >
            Replace image
          </button>
          {onRegenerate ? (
            <button
              type="button"
              className="btn small ghost"
              disabled={regenerating}
              onClick={onRegenerate}
            >
              {regenerating ? "Regenerating…" : "Regenerate with AI"}
            </button>
          ) : null}
          <label className="text-inspector-field">
            Horizontal
            <input
              type="range"
              min={0}
              max={100}
              value={posX}
              onChange={(event) =>
                onFrameChange({ posX: Number(event.target.value) })
              }
            />
          </label>
          <label className="text-inspector-field">
            Vertical
            <input
              type="range"
              min={0}
              max={100}
              value={posY}
              onChange={(event) =>
                onFrameChange({ posY: Number(event.target.value) })
              }
            />
          </label>
          <label className="text-inspector-field">
            Zoom {Math.round(zoom * 100)}%
            <input
              type="range"
              min={CAROUSEL_IMAGE_ZOOM_MIN}
              max={CAROUSEL_IMAGE_ZOOM_MAX}
              step={0.05}
              value={zoom}
              onChange={(event) =>
                onFrameChange({ zoom: Number(event.target.value) })
              }
            />
          </label>
          <p className="text-inspector-hint">
            Framing stays inside this slide layout. Empty values keep the
            original cover crop.
          </p>
        </div>
      </div>
    </aside>
  );
}
