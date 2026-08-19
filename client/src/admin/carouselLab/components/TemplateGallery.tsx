import { cn } from "@/lib/utils";
import type { TemplateId } from "../types";
import { TEMPLATE_REGISTRY } from "../templates/registry";

export function TemplateGallery({
  activeId,
  onSelect,
}: {
  activeId: TemplateId;
  onSelect: (id: TemplateId) => void;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Templates
        </h2>
        <p className="text-xs text-zinc-500">Applies to every slide instantly.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATE_REGISTRY.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "overflow-hidden rounded-xl border text-left transition",
              activeId === t.id
                ? "border-violet-500 ring-2 ring-violet-400/30"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
            )}
          >
            <div
              className="flex h-14 flex-col justify-end p-2"
              style={{ background: t.bg, color: t.fg }}
            >
              <span
                className="text-[10px] font-bold"
                style={{ color: t.accent }}
              >
                Aa
              </span>
            </div>
            <div className="px-2 py-1.5">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {t.label}
              </p>
              <p className="truncate text-[10px] text-zinc-500">
                {t.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
