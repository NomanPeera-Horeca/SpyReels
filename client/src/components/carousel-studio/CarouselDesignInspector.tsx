import { useEffect, useState, type CSSProperties } from "react";
import { CAROUSEL_EDITOR_FONTS } from "@shared/carouselSlotStyle";
import {
  carouselDesignContrastWarning,
  expandCarouselDesignHex,
  isCarouselDesignHex,
  type CarouselDesignOverridePatch,
  type StoredCarouselDesignOverride,
} from "@shared/carouselDesignOverride";
import type { CarouselDesignTokens } from "@shared/carouselTemplates";

type CarouselDesignInspectorProps = {
  template: Pick<CarouselDesignTokens, "colors" | "fontFamily">;
  value: StoredCarouselDesignOverride | null;
  onChange: (patch: CarouselDesignOverridePatch) => void;
  onReset: () => void;
};

const COLOR_FIELDS: Array<{
  key: "background" | "foreground" | "accent" | "muted";
  label: string;
}> = [
  { key: "background", label: "Background" },
  { key: "foreground", label: "Text" },
  { key: "accent", label: "Accent" },
  { key: "muted", label: "Muted" },
];

function effectiveColor(
  key: "background" | "foreground" | "accent" | "muted",
  value: StoredCarouselDesignOverride | null,
  template: Pick<CarouselDesignTokens, "colors">
): string {
  return value?.[key] ?? template.colors[key];
}

function ColorRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const pickerValue = expandCarouselDesignHex(draft) ?? "#000000";

  return (
    <label className="text-inspector-field">
      <span>{label}</span>
      <div className="design-inspector-color">
        <input
          type="color"
          value={pickerValue}
          aria-label={`${label} color`}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            onCommit(next);
          }}
        />
        <input
          type="text"
          value={draft}
          aria-label={`${label} hex`}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim();
            setDraft(next);
            if (isCarouselDesignHex(next)) onCommit(next);
          }}
          style={
            isCarouselDesignHex(draft)
              ? ({ "--swatch": draft } as CSSProperties)
              : undefined
          }
        />
      </div>
    </label>
  );
}

export function CarouselDesignInspector({
  template,
  value,
  onChange,
  onReset,
}: CarouselDesignInspectorProps) {
  const background = effectiveColor("background", value, template);
  const foreground = effectiveColor("foreground", value, template);
  const showContrastHint = carouselDesignContrastWarning(background, foreground);

  return (
    <aside className="panel text-inspector design-inspector" aria-label="Design">
      <div className="panel-head">
        <h3>Design</h3>
        <span className="text-inspector-role">Applies to all slides</span>
      </div>
      <div className="text-inspector-body">
        <div className="design-inspector-section">
          <h4>Colors</h4>
          {COLOR_FIELDS.map((field) => (
            <ColorRow
              key={field.key}
              label={field.label}
              value={effectiveColor(field.key, value, template)}
              onCommit={(next) => onChange({ [field.key]: next })}
            />
          ))}
          {showContrastHint ? (
            <p className="text-inspector-hint">
              Text may be hard to read on this background.
            </p>
          ) : null}
        </div>

        <div className="design-inspector-section">
          <h4>Typography</h4>
          <label className="text-inspector-field">
            <span>Display font</span>
            <select
              value={value?.fontDisplay ?? ""}
              onChange={(event) =>
                onChange({ fontDisplay: event.target.value || null })
              }
              aria-label="Display font"
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
            <span>Body font</span>
            <select
              value={value?.fontBody ?? ""}
              onChange={(event) =>
                onChange({ fontBody: event.target.value || null })
              }
              aria-label="Body font"
            >
              <option value="">Layout default</option>
              {CAROUSEL_EDITOR_FONTS.map((font) => (
                <option key={font.id} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          className="btn ghost small design-inspector-reset"
          onClick={onReset}
        >
          Reset to template
        </button>
      </div>
    </aside>
  );
}
