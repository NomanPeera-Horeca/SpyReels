import { useEffect, useState, type CSSProperties } from "react";
import {
  CAROUSEL_EDITOR_FONTS,
  CAROUSEL_EDITOR_FONT_SIZE_MAX,
  CAROUSEL_EDITOR_FONT_SIZE_MIN,
  CAROUSEL_EDITOR_FONT_WEIGHTS,
  type CarouselSlotStyleOverride,
  type CarouselSlotStylePatch,
  type CarouselSlotTextAlign,
} from "@shared/carouselSlotStyle";
import { slotLabelForRole } from "./textInspectorModel";

type CarouselTextInspectorProps = {
  role: string;
  slotId: string;
  value: string;
  style: CarouselSlotStyleOverride | undefined;
  onTextChange: (value: string) => void;
  onStyleChange: (patch: CarouselSlotStylePatch) => void;
};

const ALIGN_OPTIONS: CarouselSlotTextAlign[] = ["left", "center", "right"];

export function CarouselTextInspector({
  role,
  slotId,
  value,
  style,
  onTextChange,
  onStyleChange,
}: CarouselTextInspectorProps) {
  const label = slotLabelForRole(role);
  const fontValue = style?.fontFamily ?? "";
  const sizeValue = style?.fontSizePx ?? "";
  const weightValue = style?.fontWeight ?? "";
  const alignValue = style?.textAlign ?? "";
  const savedColor = style?.color ?? "";
  const [colorDraft, setColorDraft] = useState(savedColor);

  useEffect(() => {
    setColorDraft(savedColor);
  }, [savedColor, slotId]);

  return (
    <aside className="panel text-inspector" aria-label="Text">
      <div className="panel-head">
        <h3>Text</h3>
        <span className="text-inspector-role">{label}</span>
      </div>
      <div className="text-inspector-body">
        <label className="text-inspector-field">
          <span>Content</span>
          <textarea
            value={value}
            rows={role === "body" || role === "quote" ? 5 : 3}
            onChange={(event) => onTextChange(event.target.value)}
            aria-label={`${label} text`}
          />
        </label>

        <label className="text-inspector-field">
          <span>Font</span>
          <select
            value={fontValue}
            onChange={(event) =>
              onStyleChange({ fontFamily: event.target.value })
            }
          >
            <option value="">Layout default</option>
            {CAROUSEL_EDITOR_FONTS.map((font) => (
              <option key={font.id} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-inspector-field">
          <span>Size</span>
          <input
            type="number"
            min={CAROUSEL_EDITOR_FONT_SIZE_MIN}
            max={CAROUSEL_EDITOR_FONT_SIZE_MAX}
            placeholder="Default"
            value={sizeValue}
            onChange={(event) => {
              const raw = event.target.value;
              if (!raw) {
                onStyleChange({ fontSizePx: null });
                return;
              }
              onStyleChange({ fontSizePx: Number(raw) });
            }}
          />
        </label>

        <label className="text-inspector-field">
          <span>Weight</span>
          <select
            value={weightValue}
            onChange={(event) =>
              onStyleChange({
                fontWeight: event.target.value
                  ? Number(event.target.value)
                  : null,
              })
            }
          >
            <option value="">Layout default</option>
            {CAROUSEL_EDITOR_FONT_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="text-inspector-field">
          <legend>Align</legend>
          <div className="text-inspector-align">
            {ALIGN_OPTIONS.map((align) => (
              <button
                key={align}
                type="button"
                className={alignValue === align ? "active" : ""}
                onClick={() => onStyleChange({ textAlign: align })}
              >
                {align}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="text-inspector-field">
          <span>Color</span>
          <input
            type="text"
            placeholder="#FFFFFF"
            value={colorDraft}
            onChange={(event) => {
              const next = event.target.value.trim();
              setColorDraft(next);
              if (!next || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
                onStyleChange({ color: next || null });
              }
            }}
            style={
              colorDraft
                ? ({ "--swatch": colorDraft } as CSSProperties)
                : undefined
            }
          />
        </label>
        <p className="text-inspector-hint">
          Slot {slotId}. Empty fields keep the original layout style.
        </p>
      </div>
    </aside>
  );
}
