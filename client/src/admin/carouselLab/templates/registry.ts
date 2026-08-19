import type { TemplateId } from "../types";

export type TemplateStyle = {
  id: TemplateId;
  label: string;
  description: string;
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  headlineWeight: number;
  radius: string;
  fontFamily: string;
};

export const TEMPLATE_REGISTRY: TemplateStyle[] = [
  {
    id: "authority",
    label: "Authority",
    description: "Confident navy and sharp type",
    bg: "#0b1220",
    fg: "#f8fafc",
    muted: "#94a3b8",
    accent: "#38bdf8",
    headlineWeight: 800,
    radius: "18px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Magazine serif energy",
    bg: "#faf7f2",
    fg: "#1c1917",
    muted: "#78716c",
    accent: "#b45309",
    headlineWeight: 700,
    radius: "12px",
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Clean violet product look",
    bg: "#ffffff",
    fg: "#0f172a",
    muted: "#64748b",
    accent: "#7c3aed",
    headlineWeight: 750,
    radius: "24px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    id: "apple",
    label: "Apple",
    description: "Quiet white space, soft gray",
    bg: "#f5f5f7",
    fg: "#1d1d1f",
    muted: "#86868b",
    accent: "#0071e3",
    headlineWeight: 600,
    radius: "28px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    id: "magazine",
    label: "Magazine",
    description: "High contrast black and cream",
    bg: "#111111",
    fg: "#f5f0e8",
    muted: "#a8a29e",
    accent: "#ef4444",
    headlineWeight: 800,
    radius: "8px",
    fontFamily: "Georgia, serif",
  },
  {
    id: "bold",
    label: "Bold",
    description: "Loud headlines, punchy accent",
    bg: "#fff7ed",
    fg: "#7c2d12",
    muted: "#9a3412",
    accent: "#ea580c",
    headlineWeight: 900,
    radius: "16px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    id: "luxury",
    label: "Luxury",
    description: "Gold on deep charcoal",
    bg: "#171412",
    fg: "#f5e6c8",
    muted: "#a8a29e",
    accent: "#d4af37",
    headlineWeight: 600,
    radius: "10px",
    fontFamily: "Georgia, serif",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Sparse lines, lots of air",
    bg: "#fafafa",
    fg: "#171717",
    muted: "#737373",
    accent: "#171717",
    headlineWeight: 500,
    radius: "4px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    id: "corporate",
    label: "Corporate",
    description: "Trusted blue and slate",
    bg: "#f8fafc",
    fg: "#0f172a",
    muted: "#475569",
    accent: "#2563eb",
    headlineWeight: 700,
    radius: "14px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    id: "dark",
    label: "Dark",
    description: "Near-black with neon accent",
    bg: "#09090b",
    fg: "#fafafa",
    muted: "#a1a1aa",
    accent: "#a78bfa",
    headlineWeight: 700,
    radius: "20px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
];

export function getTemplate(id: TemplateId): TemplateStyle {
  return TEMPLATE_REGISTRY.find((t) => t.id === id) ?? TEMPLATE_REGISTRY[2]!;
}
