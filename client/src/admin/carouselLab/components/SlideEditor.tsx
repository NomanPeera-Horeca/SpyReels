import type { CarouselSlide, SlideRole } from "../types";

export function SlideEditor({
  slide,
  onChange,
  onClose,
}: {
  slide: CarouselSlide;
  onChange: (next: CarouselSlide) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Edit slide</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Done
          </button>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Role
            </span>
            <select
              value={slide.role}
              onChange={(e) =>
                onChange({ ...slide, role: e.target.value as SlideRole })
              }
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="hook">Hook</option>
              <option value="story">Story</option>
              <option value="point">Point</option>
              <option value="cta">CTA</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Headline
            </span>
            <textarea
              value={slide.headline}
              onChange={(e) => onChange({ ...slide, headline: e.target.value })}
              rows={2}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Body
            </span>
            <textarea
              value={slide.body}
              onChange={(e) => onChange({ ...slide, body: e.target.value })}
              rows={4}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Image URL
            </span>
            <input
              value={slide.imageUrl ?? ""}
              onChange={(e) =>
                onChange({ ...slide, imageUrl: e.target.value || undefined })
              }
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="https://…"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Upload image
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                onChange({ ...slide, imageUrl: URL.createObjectURL(file) });
              }}
              className="text-xs"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Background override
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={slide.backgroundOverride || "#ffffff"}
                onChange={(e) =>
                  onChange({ ...slide, backgroundOverride: e.target.value })
                }
                className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-700"
              />
              <button
                type="button"
                className="text-xs font-medium text-violet-600"
                onClick={() =>
                  onChange({ ...slide, backgroundOverride: undefined })
                }
              >
                Clear
              </button>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
