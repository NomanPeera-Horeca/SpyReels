export function sanitizeAiOutput(text: string): string {
  if (!text) return text;
  return text
    .replace(/—/g, ", ")
    .replace(/–/g, "-")
    .replace(/\s+,\s+,\s+/g, ", ")
    .replace(/,\s*,/g, ",")
    .trim();
}

export function sanitizeAiOutputDeep<T>(obj: T): T {
  if (typeof obj === "string") return sanitizeAiOutput(obj) as T;
  if (Array.isArray(obj)) return obj.map(sanitizeAiOutputDeep) as T;
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = sanitizeAiOutputDeep(v);
    }
    return result as T;
  }
  return obj;
}
