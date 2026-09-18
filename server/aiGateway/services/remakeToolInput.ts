export function normalizeRemakeToolInput(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object") return rawInput;

  const record = rawInput as Record<string, unknown>;
  const instruction =
    typeof record.instruction === "string" ? record.instruction.trim() : "";

  if (instruction) return rawInput;

  const mode = typeof record.mode === "string" ? record.mode : "";
  const angle = typeof record.angle === "string" ? record.angle.trim() : "";

  if (mode === "same_topic") {
    return {
      ...record,
      instruction: "keep the same topic",
    };
  }

  if (mode === "custom" && angle) {
    return {
      ...record,
      instruction: `make this about ${angle}`,
    };
  }

  if (mode === "niche") {
    // Do not trust a stale host's niche guess. Convert it back to an ambiguous
    // instruction so the server-side intent resolver requires clarification.
    return {
      ...record,
      instruction: "remake this",
    };
  }

  return rawInput;
}
