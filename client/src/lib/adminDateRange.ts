export const DATE_RANGE_PRESET_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "60d", label: "60 days" },
  { value: "90d", label: "90 days" },
  { value: "365d", label: "1 year" },
  { value: "custom", label: "Custom" },
] as const;

export type DateRangePresetValue = (typeof DATE_RANGE_PRESET_OPTIONS)[number]["value"];
