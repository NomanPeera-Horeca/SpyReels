import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import type { CarouselSlideValuesById } from "@/components/CarouselRenderer";
import type {
  CarouselImageUrlMap,
  CarouselSlideSpec,
  CarouselTemplate,
} from "@shared/carouselTemplates";
import {
  detectCarouselSource,
  looksLikeCarouselSourceUrl,
  normalizeCarouselSourceUrl,
  type CarouselDetectedSource,
} from "./carouselSourceDetector";
import { CarouselRecentThumb } from "./CarouselRecentThumb";
import "./carouselStudioCreate.css";

export type CarouselLandingRecentItem = {
  id: number;
  title: string;
  createdAt: Date | string;
  thumbnailUrl?: string | null;
  /** Live first-slide preview (preferred over photo-only thumbnail). */
  template?: CarouselTemplate | null;
  slides?: CarouselSlideSpec[] | null;
  slideValues?: CarouselSlideValuesById | null;
  imageUrls?: CarouselImageUrlMap | null;
  aspectRatio?: string | null;
};

const PASTE_HELPERS = [
  { id: "youtube", label: "YouTube", hint: "Paste a YouTube link" },
  { id: "article", label: "Article", hint: "Paste an article link" },
  { id: "instagram", label: "Instagram", hint: "Paste an Instagram post link" },
  { id: "linkedin", label: "LinkedIn", hint: "Paste a LinkedIn post link" },
  { id: "carousel", label: "Existing carousel", hint: "Paste an existing carousel link" },
] as const;

const IDEA_SUGGESTIONS = [
  {
    label: "Restaurant profit mistakes",
    value: "7 restaurant mistakes that quietly destroy profit",
  },
  {
    label: "Busy but losing cash",
    value: "Why busy restaurants can still run out of cash",
  },
  {
    label: "Menu pricing psychology",
    value: "5 menu pricing tricks that increase average order value",
  },
] as const;

function applyDetectedSource(
  raw: string,
  onIdeaChange: (value: string) => void,
  setSource: (source: { url: string; detected: CarouselDetectedSource } | null) => void
): boolean {
  const detected = detectCarouselSource(raw);
  if (detected.kind === "idea") return false;
  setSource({
    url: normalizeCarouselSourceUrl(raw.trim()),
    detected,
  });
  onIdeaChange("");
  return true;
}

function recentTimeLabel(createdAt: Date | string): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function CarouselLanding({
  idea,
  onIdeaChange,
  onCreate,
  submitting = false,
  recent = [],
  onOpenRecent,
  children,
  showSuggestions = true,
  submitLabel,
  submittingLabel,
}: {
  idea: string;
  onIdeaChange: (value: string) => void;
  onCreate: (content: string) => void;
  submitting?: boolean;
  recent?: CarouselLandingRecentItem[];
  onOpenRecent?: (id: number) => void;
  children?: ReactNode;
  showSuggestions?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const submitLockRef = useRef(false);
  const [source, setSource] = useState<{
    url: string;
    detected: CarouselDetectedSource;
  } | null>(null);
  const [helperHint, setHelperHint] = useState<string | null>(null);

  useEffect(() => {
    if (submitting) return;
    submitLockRef.current = false;
  }, [submitting]);

  useEffect(() => {
    if (!looksLikeCarouselSourceUrl(idea)) return;
    const url = normalizeCarouselSourceUrl(idea.trim());
    setSource((current) => {
      if (current?.url === url) return current;
      return {
        url,
        detected: detectCarouselSource(idea),
      };
    });
    onIdeaChange("");
  }, [idea, onIdeaChange]);

  const placeholder =
    helperHint || "What do you want your carousel to be about?";
  const canCreate =
    Boolean((source?.url || idea).trim()) &&
    !submitting &&
    !submitLockRef.current;

  const clearSource = () => {
    setSource(null);
    onIdeaChange("");
    textareaRef.current?.focus();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const content = (source?.url || idea).trim();
    if (!content || submitting || submitLockRef.current) {
      textareaRef.current?.focus();
      return;
    }
    submitLockRef.current = true;
    onCreate(content);
  };

  return (
    <div className="carousel-landing">
      <h1>Create your next carousel.</h1>
      <p className="carousel-landing-sub">
        Tell SpyReels what you want to say, or paste something you want to turn
        into a carousel.
      </p>

      <form
        className="carousel-composer"
        onSubmit={handleSubmit}
        aria-busy={submitting}
      >
        <textarea
          ref={textareaRef}
          className="carousel-composer-input"
          aria-label="Carousel topic or link"
          placeholder={placeholder}
          value={idea}
          disabled={submitting}
          onChange={(event) => {
            const next = event.target.value;
            if (applyDetectedSource(next, onIdeaChange, setSource)) return;
            if (!next.trim()) setSource(null);
            onIdeaChange(next);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!looksLikeCarouselSourceUrl(pasted)) return;
            event.preventDefault();
            applyDetectedSource(pasted, onIdeaChange, setSource);
          }}
        />

        {source ? (
          <div className="carousel-source-chip" role="status">
            <span className="carousel-source-chip-check" aria-hidden>
              ✓
            </span>
            <span>{source.detected.chipLabel}</span>
            <button
              type="button"
              className="carousel-source-chip-close"
              aria-label="Clear source"
              onClick={clearSource}
            >
              ×
            </button>
          </div>
        ) : null}

        {children}

        <div className="carousel-composer-bottom">
          <button
            type="submit"
            className="carousel-create-btn"
            disabled={!canCreate}
            aria-disabled={!canCreate}
          >
            {submitting
              ? submittingLabel || "Creating..."
              : submitLabel || "Create carousel →"}
          </button>
        </div>
      </form>

      <div className="carousel-source-hint">
        <strong>Paste anything:</strong>
        <span className="carousel-source-links">
          {PASTE_HELPERS.map((helper, index) => (
            <span key={helper.id}>
              {index > 0 ? <span aria-hidden> · </span> : null}
              <button
                type="button"
                className="carousel-source-link"
                onClick={() => {
                  if (submitting) return;
                  setHelperHint(helper.hint);
                  textareaRef.current?.focus();
                }}
              >
                {helper.label}
              </button>
            </span>
          ))}
        </span>
      </div>

      {showSuggestions ? (
        <div className="carousel-suggestions">
          {IDEA_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              className="carousel-suggestion"
              onClick={() => {
                if (submitting) return;
                setSource(null);
                onIdeaChange(suggestion.value);
                textareaRef.current?.focus();
              }}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

      {recent.length > 0 && onOpenRecent ? (
        <div className="carousel-recent-mini">
          <div className="carousel-recent-title">
            <strong>Recent</strong>
            <span>Continue editing</span>
          </div>
          {recent.map((item) => {
            const when = recentTimeLabel(item.createdAt);
            return (
              <button
                key={item.id}
                type="button"
                className="carousel-recent-item"
                aria-label={
                  when ? `${item.title}, ${when}` : item.title
                }
                onClick={() => {
                  if (submitting) return;
                  onOpenRecent(item.id);
                }}
              >
                <CarouselRecentThumb
                  title={item.title}
                  thumbnailUrl={item.thumbnailUrl}
                  template={item.template}
                  slides={item.slides}
                  slideValues={item.slideValues}
                  imageUrls={item.imageUrls}
                  aspectRatio={item.aspectRatio}
                />
                <span className="carousel-recent-name">{item.title}</span>
                {when ? (
                  <span className="carousel-recent-time">{when}</span>
                ) : (
                  <span />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
