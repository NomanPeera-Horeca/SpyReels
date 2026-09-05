import type { Platform } from "./mockData";

export function previewCaptionFromSlots(
  slots: Record<string, string> | undefined
): string {
  if (!slots) return "";
  return (
    slots.headline?.trim() ||
    slots.title?.trim() ||
    slots.kicker?.trim() ||
    slots.body?.trim() ||
    ""
  );
}

export function previewHandleLabel(
  handle: string | null | undefined,
  fallbackName: string | null | undefined
): string {
  const trimmedHandle = handle?.trim().replace(/^@/, "") ?? "";
  if (trimmedHandle) return trimmedHandle;
  const name = fallbackName?.trim() ?? "";
  if (name) return name.replace(/\s+/g, "").toLowerCase();
  return "spyreels";
}

export function previewDisplayName(
  fallbackName: string | null | undefined,
  handle: string | null | undefined
): string {
  const name = fallbackName?.trim();
  if (name) return name;
  const trimmedHandle = handle?.trim().replace(/^@/, "");
  if (trimmedHandle) return trimmedHandle;
  return "SpyReels";
}

export function previewInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "S";
}

export function socialPreviewTitle(platform: Platform): string {
  return platform === "linkedin"
    ? "LinkedIn preview"
    : "Instagram preview";
}
