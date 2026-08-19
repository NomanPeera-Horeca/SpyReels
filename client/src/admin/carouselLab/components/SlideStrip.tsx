import { Copy, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandSettings, CarouselSlide, TemplateId } from "../types";
import { getTemplate } from "../templates/registry";

export function SlideStrip({
  slides,
  activeIndex,
  templateId,
  brand,
  onSelect,
  onDuplicate,
  onDelete,
  onMove,
  onEdit,
}: {
  slides: CarouselSlide[];
  activeIndex: number;
  templateId: TemplateId;
  brand: BrandSettings;
  onSelect: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onEdit: (index: number) => void;
}) {
  if (slides.length === 0) return null;
  const t = getTemplate(templateId);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Slides
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {slides.map((slide, i) => (
          <div key={slide.id} className="w-[108px] shrink-0 space-y-1.5">
            <button
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "aspect-[4/5] w-full overflow-hidden rounded-xl border text-left transition",
                i === activeIndex
                  ? "border-violet-500 ring-2 ring-violet-400/40"
                  : "border-zinc-200 dark:border-zinc-700"
              )}
              style={{ background: slide.backgroundOverride || t.bg, color: t.fg }}
            >
              <div className="flex h-full flex-col p-2">
                <span
                  className="text-[8px] font-semibold uppercase tracking-wide"
                  style={{ color: brand.primaryColor || t.accent }}
                >
                  {slide.role}
                </span>
                <p className="mt-1 line-clamp-4 text-[9px] font-semibold leading-snug">
                  {slide.headline}
                </p>
              </div>
            </button>
            <div className="flex justify-center gap-0.5">
              <IconBtn label="Edit" onClick={() => onEdit(i)}>
                <Pencil className="h-3 w-3" />
              </IconBtn>
              <IconBtn label="Duplicate" onClick={() => onDuplicate(i)}>
                <Copy className="h-3 w-3" />
              </IconBtn>
              <IconBtn label="Move up" onClick={() => onMove(i, -1)}>
                <ChevronUp className="h-3 w-3" />
              </IconBtn>
              <IconBtn label="Move down" onClick={() => onMove(i, 1)}>
                <ChevronDown className="h-3 w-3" />
              </IconBtn>
              <IconBtn label="Delete" onClick={() => onDelete(i)}>
                <Trash2 className="h-3 w-3" />
              </IconBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {children}
    </button>
  );
}
