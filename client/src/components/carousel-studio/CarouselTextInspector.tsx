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
import type { CarouselSlotRewriteAction } from "@shared/carouselSlotRewrite";
import { slotLabelForRole } from "./textInspectorModel";

type CarouselTextInspectorProps = {
  role: string;
  slotId: string;
  value: string;
  style: CarouselSlotStyleOverride | undefined;
  onTextChange: (value: string) => void;
  onStyleChange: (patch: CarouselSlotStylePatch) => void;
  aiEnabled?: boolean;
  aiBusy?: boolean;
  aiError?: string | null;
  alternatives?: string[];
  previewText?: string | null;
  previewAction?: CarouselSlotRewriteAction | null;
  onAiAction?: (action: CarouselSlotRewriteAction) => void;
  onApplyAlternative?: (text: string) => void;
  onCancelAlternatives?: () => void;
  onUsePreview?: () => void;
  onTryAgain?: () => void;
  onCancelPreview?: () => void;
};

const ALIGN_OPTIONS: CarouselSlotTextAlign[] = ["left", "center", "right"];

const SINGLE_AI_ACTIONS: Array<{
  action: CarouselSlotRewriteAction;
  label: string;
}> = [
  { action: "make_punchier", label: "Make punchier" },
  { action: "make_shorter", label: "Make shorter" },
  { action: "make_clearer", label: "Make clearer" },
  { action: "rewrite", label: "Rewrite" },
];

const AI_STATUS: Record<CarouselSlotRewriteAction, string> = {
  make_punchier: "Making this punchier...",
  make_shorter: "Shortening...",
  make_clearer: "Making this clearer...",
  rewrite: "Rewriting...",
  alternatives: "Finding alternatives...",
};

export function CarouselTextInspector({
  role,
  slotId,
  value,
  style,
  onTextChange,
  onStyleChange,
  aiEnabled = false,
  aiBusy = false,
  aiError = null,
  alternatives = [],
  previewText = null,
  previewAction = null,
  onAiAction,
  onApplyAlternative,
  onCancelAlternatives,
  onUsePreview,
  onTryAgain,
  onCancelPreview,
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

        {aiEnabled ? (
          <section className="text-inspector-ai" aria-label="AI">
            <h4>AI</h4>
            <div className="text-inspector-ai-actions">
              {SINGLE_AI_ACTIONS.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  disabled={aiBusy}
                  onClick={() => onAiAction?.(item.action)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-inspector-ai-alts"
              disabled={aiBusy}
              onClick={() => onAiAction?.("alternatives")}
            >
              Give me 3 alternatives
            </button>
            {aiBusy ? (
              <p className="text-inspector-ai-status" role="status">
                {previewAction
                  ? AI_STATUS[previewAction]
                  : "Rewriting..."}
              </p>
            ) : null}
            {aiError ? (
              <p className="text-inspector-ai-error" role="alert">
                {aiError}
              </p>
            ) : null}
            {previewText ? (
              <div className="text-inspector-ai-preview">
                <p>{previewText}</p>
                <div className="text-inspector-ai-preview-actions">
                  <button type="button" disabled={aiBusy} onClick={onUsePreview}>
                    Use this
                  </button>
                  <button type="button" disabled={aiBusy} onClick={onTryAgain}>
                    Try again
                  </button>
                  <button
                    type="button"
                    className="text-inspector-ai-cancel"
                    disabled={aiBusy}
                    onClick={onCancelPreview}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {alternatives.length > 0 ? (
              <div className="text-inspector-ai-choices">
                {alternatives.map((option, index) => (
                  <button
                    key={`${index}-${option}`}
                    type="button"
                    disabled={aiBusy}
                    onClick={() => onApplyAlternative?.(option)}
                  >
                    {option}
                  </button>
                ))}
                <button
                  type="button"
                  className="text-inspector-ai-cancel"
                  disabled={aiBusy}
                  onClick={onCancelAlternatives}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
