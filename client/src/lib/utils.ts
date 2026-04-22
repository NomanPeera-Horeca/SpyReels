import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Match `seedDemoScrape` handle normalization for analytics payloads */
export function normalizeAnalyticsHandle(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}
