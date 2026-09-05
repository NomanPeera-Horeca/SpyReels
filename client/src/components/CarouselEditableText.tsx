import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { CarouselSlotValues } from "@shared/carouselTemplates";
import {
  applyCarouselSlotStyleOverride,
  inferCarouselSlotRole,
} from "@shared/carouselSlotStyle";
import { useCarouselEditorChrome } from "@/components/carouselEditorChrome";

export type CarouselEditableTextTag = "p" | "h2" | "h3" | "span" | "div";

export type CarouselEditableTextProps = {
  slotId: string;
  value: string;
  as?: CarouselEditableTextTag;
  style?: CSSProperties;
  className?: string;
  editable?: boolean;
  onCommit?: (slotId: string, value: string) => void;
  /** If true, Enter inserts a newline; commit on blur only. */
  multiline?: boolean;
  /**
   * Visual fragment of a shared slot. Click selects the real slotId.
   * Does not inline-edit, so a split line cannot overwrite the full slot.
   */
  selectOnly?: boolean;
};

/** Pick the first non-empty slot among preferred ids (for layouts with fallback keys). */
export function pickCarouselSlot(
  values: CarouselSlotValues,
  preferredIds: string[]
): { slotId: string; value: string } {
  for (const id of preferredIds) {
    const v = values[id];
    if (v !== undefined && v !== "") return { slotId: id, value: v };
  }
  const fallback = preferredIds[0] ?? "headline";
  return { slotId: fallback, value: values[fallback] ?? "" };
}

function normalizeCommitted(raw: string, multiline: boolean): string {
  const text = raw.replace(/\u00a0/g, " ");
  if (multiline) {
    return text.replace(/^\n+/, "").replace(/\n+$/, "");
  }
  return text.replace(/\n/g, " ").trim();
}

/**
 * Click-to-edit text slot. Outside edit mode the DOM holds committed text
 * (safe for html-to-image capture). Escape cancels; blur/Enter commits.
 */
export function CarouselEditableText({
  slotId,
  value,
  as: Tag = "span",
  style,
  className,
  editable = false,
  onCommit,
  multiline = false,
  selectOnly = false,
}: CarouselEditableTextProps) {
  const chrome = useCarouselEditorChrome();
  const [editing, setEditing] = useState(false);
  /** Local display so commit updates DOM before parent state catches up (PNG capture). */
  const [displayValue, setDisplayValue] = useState(value);
  const ref = useRef<HTMLElement | null>(null);
  const skipCommitRef = useRef(false);
  const selected = Boolean(
    chrome?.selectionEnabled && chrome.selectedSlotId === slotId
  );
  const role = inferCarouselSlotRole(slotId);
  const mergedStyle = applyCarouselSlotStyleOverride(
    style as Record<string, unknown> | undefined,
    chrome?.styles?.[slotId]
  ) as CSSProperties;

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.innerText = displayValue;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only seed DOM when entering edit mode; avoid resetting while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function commitFromDom() {
    const raw = ref.current?.innerText ?? displayValue;
    const next = normalizeCommitted(raw, multiline);
    setDisplayValue(next);
    setEditing(false);
    if (next !== value) {
      onCommit?.(slotId, next);
    }
  }

  function cancelEdit() {
    skipCommitRef.current = true;
    setDisplayValue(value);
    setEditing(false);
  }

  function selectSlot(event: MouseEvent) {
    event.stopPropagation();
    chrome?.onSelectSlot?.(slotId);
  }

  if (!editable) {
    return (
      <Tag className={className} style={mergedStyle} data-carousel-slot-id={slotId}>
        {value}
      </Tag>
    );
  }

  if (!editing) {
    return (
      <Tag
        className={className}
        data-carousel-slot-id={slotId}
        data-carousel-slot-role={role}
        data-carousel-slot-selected={selected ? "true" : undefined}
        style={{
          ...mergedStyle,
          cursor: "text",
        }}
        title="Click to select. Double-click to type on the slide."
        onClick={(event: MouseEvent) => {
          if (chrome?.selectionEnabled) {
            if (selected && !selectOnly) {
              event.stopPropagation();
              setEditing(true);
              return;
            }
            selectSlot(event);
            return;
          }
          if (selectOnly) {
            event.stopPropagation();
            return;
          }
          event.stopPropagation();
          setEditing(true);
        }}
        onDoubleClick={(event: MouseEvent) => {
          event.stopPropagation();
          chrome?.onSelectSlot?.(slotId);
          if (!selectOnly) setEditing(true);
        }}
      >
        {displayValue}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref as never}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-carousel-slot-id={slotId}
      data-carousel-slot-role={role}
      data-carousel-slot-selected={selected ? "true" : undefined}
      data-carousel-editing="true"
      style={{
        ...mergedStyle,
        cursor: "text",
        minWidth: "1ch",
        caretColor: "currentColor",
        whiteSpace: multiline ? "pre-wrap" : mergedStyle?.whiteSpace,
      }}
      onBlur={() => {
        if (skipCommitRef.current) {
          skipCommitRef.current = false;
          return;
        }
        commitFromDom();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
          (e.currentTarget as HTMLElement).blur();
          return;
        }
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    />
  );
}
