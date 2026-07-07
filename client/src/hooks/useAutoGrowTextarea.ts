import { useCallback, useEffect, type RefObject } from "react";

const DEFAULT_MAX_LINES = 10;

export function useAutoGrowTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxLines = DEFAULT_MAX_LINES
) {
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const maxHeight = lineHeight * maxLines;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxLines, textareaRef]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return resize;
}
