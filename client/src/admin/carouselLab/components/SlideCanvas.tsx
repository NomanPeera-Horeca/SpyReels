import type { BrandSettings, CarouselSlide, TemplateId } from "../types";
import { getTemplate } from "../templates/registry";

const FONT_MAP = {
  inter: "Inter, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export function SlideCanvas({
  slide,
  templateId,
  brand,
  index,
  total,
}: {
  slide: CarouselSlide;
  templateId: TemplateId;
  brand: BrandSettings;
  index: number;
  total: number;
}) {
  const t = getTemplate(templateId);
  const bg = slide.backgroundOverride || t.bg;
  const font = brand.fontPair ? FONT_MAP[brand.fontPair] : t.fontFamily;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        background: bg,
        color: t.fg,
        fontFamily: font,
        borderRadius: t.radius,
      }}
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          {brand.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt=""
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div
              className="h-6 w-6 rounded-full"
              style={{ background: brand.primaryColor || t.accent }}
            />
          )}
          <span className="text-[11px] font-medium opacity-80">
            {brand.handle || "your brand"}
          </span>
        </div>
        <span className="text-[10px] opacity-50">
          {index + 1}/{total}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4 px-6 py-8">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: brand.primaryColor || t.accent }}
        >
          {slide.role}
        </p>
        <h2
          className="text-[1.55rem] leading-tight tracking-tight"
          style={{ fontWeight: t.headlineWeight, color: t.fg }}
        >
          {slide.headline}
        </h2>
        <p className="text-[0.95rem] leading-relaxed" style={{ color: t.muted }}>
          {slide.body}
        </p>
        {slide.imageUrl ? (
          <img
            src={slide.imageUrl}
            alt=""
            className="mt-2 max-h-36 w-full rounded-xl object-cover"
          />
        ) : null}
      </div>

      <div
        className="h-1 w-full"
        style={{ background: brand.primaryColor || t.accent }}
      />
    </div>
  );
}
