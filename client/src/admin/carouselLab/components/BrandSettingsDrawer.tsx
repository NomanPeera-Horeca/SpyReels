import type { BrandSettings } from "../types";

export function BrandSettingsDrawer({
  brand,
  onChange,
}: {
  brand: BrandSettings;
  onChange: (next: BrandSettings) => void;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div>
        <h2 className="text-sm font-semibold">Brand settings</h2>
        <p className="text-xs text-zinc-500">Applies across all slides.</p>
      </div>

      <Field label="Instagram handle">
        <input
          value={brand.handle}
          onChange={(e) => onChange({ ...brand, handle: e.target.value })}
          className="field-input"
          placeholder="@yourbrand"
        />
      </Field>

      <Field label="Logo URL">
        <input
          value={brand.logoUrl}
          onChange={(e) => onChange({ ...brand, logoUrl: e.target.value })}
          className="field-input"
          placeholder="https://…"
        />
      </Field>

      <Field label="Upload logo">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            onChange({ ...brand, logoUrl: url });
          }}
          className="text-xs"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Primary">
          <input
            type="color"
            value={brand.primaryColor}
            onChange={(e) =>
              onChange({ ...brand, primaryColor: e.target.value })
            }
            className="h-10 w-full cursor-pointer rounded-lg border border-zinc-200 bg-transparent dark:border-zinc-700"
          />
        </Field>
        <Field label="Secondary">
          <input
            type="color"
            value={brand.secondaryColor}
            onChange={(e) =>
              onChange({ ...brand, secondaryColor: e.target.value })
            }
            className="h-10 w-full cursor-pointer rounded-lg border border-zinc-200 bg-transparent dark:border-zinc-700"
          />
        </Field>
      </div>

      <Field label="Typography">
        <select
          value={brand.fontPair}
          onChange={(e) =>
            onChange({
              ...brand,
              fontPair: e.target.value as BrandSettings["fontPair"],
            })
          }
          className="field-input"
        >
          <option value="inter">Inter (modern)</option>
          <option value="serif">Serif (editorial)</option>
          <option value="mono">Mono (technical)</option>
        </select>
      </Field>

      <style>{`
        .field-input {
          width: 100%;
          height: 2.5rem;
          border-radius: 0.75rem;
          border: 1px solid rgb(228 228 231);
          background: rgb(250 250 250);
          padding: 0 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .dark .field-input {
          border-color: rgb(63 63 70);
          background: rgb(9 9 11);
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
