/**
 * Remake popup (Figma DRAFT 1750:656 Light, 1750:812 Dark, 1754:944 phone,
 * states 1757:1432 / 1757:1554 / 1757:1681 / 1757:1800).
 *
 * Built from the design system: Card / Goal Option (badge + content slot),
 * Field / Input, Button / Primary + Secondary, Icon / Close. Light and Dark
 * follow the app theme. The idea typed in "Use my idea" is kept per video by
 * the remake chain (draft / onDraftChange), through switching options,
 * generating, errors and after the draft is created.
 */
import { useId, type ReactElement } from "react";
import { FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { ReelSourcePlatformMark } from "@/components/ReelSourcePlatformMark";
import { YouTubeInlineEmbed } from "@/components/YouTubeInlineEmbed";
import { useTheme } from "@/contexts/ThemeContext";
import { FieldInput, PrimaryButton, SecondaryButton } from "@/design-system/core";
import { GoalOption } from "@/design-system/GoalOption";
import { IconAiSparkle, IconClose, IconToolScript } from "@/design-system/icons";
import { MarketingIconProcessRemake } from "../../../public-web/components/MarketingIcons";
import {
  draftToIntent,
  REMAKE_IDEA_MAX,
  type RemakeDraft,
  type RemakeIntent,
  type RemakeIntentMedia,
} from "@/lib/remakeIntent";
import { resolveYouTubeVideoId } from "@/lib/youtubeVideoId";
import "@/design-system/tokens.css";
import styles from "./RemakeIntentDialog.module.css";

/** choose: picking; generating: submitted and running; error: run failed. */
export type RemakeIntentPhase = "choose" | "generating" | "error";

export const REMAKE_POPUP_COPY = {
  title: "Remake",
  badge: "Based on a viral Reel",
  subtitle: "Turn the source into your version",
  tabs: ["Script", "Visuals", "Preview"] as const,
  openOriginal: "Open original",
  close: "Close",
  sourceLabel: "Original Reel",
  sourceTap: "Original Reel · tap to watch",
  sourceHint: "Watch the original again while you decide how you want to use the idea.",
  sourceUnavailable: "Source preview unavailable",
  heading: "How do you want to use this Reel?",
  intro: "Choose an option or tell us your idea. SpyReels keeps the useful parts of the source and makes it yours.",
  recommended: "Recommended",
  options: {
    custom: { title: "Use my idea", description: "Keep what made this Reel work, but make it about your idea." },
    same_topic: { title: "Keep this topic", description: "Same subject and core message, rewritten in your voice." },
    niche: {
      title: "Adapt to my niche",
      description: "SpyReels chooses a strong idea for your audience and keeps the source structure.",
    },
  },
  ideaLabel: "Your idea",
  ideaPlaceholder: 'Example: Use this 4-box structure for "How to write a restaurant menu"',
  create: "Create remake",
  creating: "Creating your remake…",
  generatingNote: "This takes about a minute. Your choice and idea are kept; you can close this and we'll finish in the background.",
  errorTitle: "We couldn't create this remake.",
  errorKept: "Your choice and idea are kept. Try again.",
  tryAgain: "Try again",
} as const;

const C = REMAKE_POPUP_COPY;
const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(" ");

function errorDetail(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  if (!m) return C.errorKept;
  return `${/[.!?]$/.test(m) ? m : `${m}.`} ${C.errorKept}`;
}

export function RemakeIntentDialog({
  open,
  media,
  draft,
  onDraftChange,
  phase = "choose",
  errorMessage,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  /** Kept for callers; transcription progress is not shown (by design). */
  progressPercent?: number;
  media: RemakeIntentMedia | null;
  draft: RemakeDraft;
  onDraftChange: (draft: RemakeDraft) => void;
  phase?: RemakeIntentPhase;
  errorMessage?: string | null;
  onSubmit: (intent: RemakeIntent) => void;
  onCancel: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const ideaId = useId();
  const generating = phase === "generating";
  const intent = draftToIntent(draft);
  const canSubmit = !generating && intent != null;

  const submit = () => {
    if (canSubmit && intent) onSubmit(intent);
  };
  const pick = (mode: RemakeDraft["mode"]) => {
    if (!generating) onDraftChange({ ...draft, mode });
  };

  const platform = media?.platform ?? "instagram";
  const originalUrl = media?.originalUrl?.trim() || media?.videoPageUrl?.trim() || "";
  const youtubeVideoId =
    platform === "youtube"
      ? resolveYouTubeVideoId({ shortcode: media?.shortcode, reelUrl: originalUrl || media?.videoPageUrl })
      : null;
  const hasSourceMedia = Boolean(
    media &&
      ((media.thumbnailUrl ?? "").trim() || (media.videoUrl ?? "").trim() || (media.shortcode ?? "").trim() || originalUrl)
  );
  const platformMark = platform === "tiktok" ? "tiktok" : platform === "youtube" ? "youtube" : "instagram";

  const sourcePreview = (
    <div className={styles.mediaFrame}>
      {hasSourceMedia && platform !== "youtube" ? (
        <DashboardReelGridMedia
          className={styles.mediaFill}
          thumbnailUrl={media?.thumbnailUrl}
          videoUrl={media?.videoUrl}
          shortcode={media?.shortcode}
          reelId={platform === "instagram" ? media?.reelId ?? undefined : undefined}
          platform={platform === "tiktok" ? "tiktok" : "instagram"}
          videoPageUrl={media?.videoPageUrl ?? media?.originalUrl}
          fallbackLabel="Source Reel"
        />
      ) : hasSourceMedia && youtubeVideoId ? (
        <YouTubeInlineEmbed className={styles.mediaFill} videoId={youtubeVideoId} />
      ) : hasSourceMedia && media?.thumbnailUrl ? (
        <ReelGridThumbnail className={styles.mediaFill} thumbnailUrl={media.thumbnailUrl} width={360} height={560} />
      ) : (
        <div className={styles.mediaEmpty}>
          <FileText aria-hidden className={styles.mediaEmptyIcon} />
          <p className="sr-text-product-label">{C.sourceUnavailable}</p>
        </div>
      )}
      {hasSourceMedia ? <ReelSourcePlatformMark platform={platformMark} /> : null}
    </div>
  );

  const ideaField = (
    <div className={styles.idea}>
      <FieldInput
        id={ideaId}
        label={C.ideaLabel}
        value={draft.angle}
        maxLength={REMAKE_IDEA_MAX}
        placeholder={C.ideaPlaceholder}
        disabled={generating}
        autoComplete="off"
        helper={`${draft.angle.length}/${REMAKE_IDEA_MAX}`}
        onChange={e => onDraftChange({ ...draft, angle: e.target.value })}
        onKeyDown={e => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit();
        }}
      />
    </div>
  );

  const options: Array<{ mode: RemakeDraft["mode"]; icon: ReactElement }> = [
    { mode: "custom", icon: <IconAiSparkle /> },
    { mode: "same_topic", icon: <IconToolScript /> },
    { mode: "niche", icon: <MarketingIconProcessRemake className={styles.brandIcon} /> },
  ];

  return (
    <Dialog open={open} onOpenChange={next => !next && onCancel()}>
      <DialogContent
        showCloseButton={false}
        data-testid="remake-intent-dialog"
        data-phase={phase}
        onOpenAutoFocus={e => {
          // Focus the idea box when it is open, otherwise the selected option.
          e.preventDefault();
          const root = e.currentTarget as HTMLElement;
          const target = generating
            ? root
            : root.querySelector<HTMLElement>("input:not(:disabled)") ??
              root.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
          target?.focus();
        }}
        className={cx(
          resolvedTheme === "dark" ? "sr-scope-dark" : "sr-scope-light",
          "sr-mode-product",
          styles.dialog
        )}
      >
        <header className={styles.header}>
          <div className={styles.headerTitles}>
            <div className={styles.titleRow}>
              <DialogTitle className={cx("sr-text-product-heading-4", styles.title)}>{C.title}</DialogTitle>
              <span className={cx("sr-text-product-caption", styles.neutralBadge)}>{C.badge}</span>
            </div>
            <DialogDescription className={cx("sr-text-product-caption", styles.tertiary)}>
              {C.subtitle}
            </DialogDescription>
          </div>
          {/* Steps of the Remake flow; only Script exists today (not interactive). */}
          <ol className={styles.tabs} aria-label="Remake setup">
            {C.tabs.map((tab, i) => (
              <li
                key={tab}
                aria-current={i === 0 ? "step" : undefined}
                className={cx("sr-text-product-label", styles.tab, i === 0 && styles.tabActive)}
              >
                {tab}
              </li>
            ))}
          </ol>
          <div className={styles.headerActions}>
            {originalUrl ? (
              <SecondaryButton href={originalUrl} target="_blank" rel="noopener noreferrer" className={styles.openOriginal}>
                {C.openOriginal}
              </SecondaryButton>
            ) : null}
            <button type="button" aria-label={C.close} onClick={onCancel} className={styles.close}>
              <IconClose />
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <aside className={styles.aside}>
            <p className={cx("sr-text-product-caption", styles.overline)}>{C.sourceLabel}</p>
            {sourcePreview}
            <p className={cx("sr-text-product-caption", styles.tertiary)}>{C.sourceHint}</p>
          </aside>

          <main className={styles.main}>
            <a
              className={styles.sourceCompact}
              href={originalUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={C.sourceTap}
            >
              <span className={styles.sourceThumb}>{sourcePreview}</span>
              <span className={cx("sr-text-product-caption", styles.tertiary)}>{C.sourceTap}</span>
            </a>

            <div className={styles.intro}>
              <h2 className={cx("sr-text-product-heading-2", styles.heading)}>{C.heading}</h2>
              <p className={cx("sr-text-product-body-small", styles.secondary)}>{C.intro}</p>
            </div>

            <div className={styles.options} role="radiogroup" aria-label={C.heading}>
              {options.map(({ mode, icon }) => (
                <GoalOption
                  key={mode}
                  title={C.options[mode].title}
                  description={C.options[mode].description}
                  icon={icon}
                  iconOnMobile
                  selected={draft.mode === mode}
                  badge={mode === "custom" ? C.recommended : undefined}
                  content={mode === "custom" ? ideaField : undefined}
                  disabled={generating && draft.mode !== mode}
                  onClick={() => pick(mode)}
                  data-testid={`remake-option-${mode}`}
                />
              ))}
            </div>

            <div className={styles.footer}>
              {phase === "error" ? (
                <div className={styles.errorBox} role="alert">
                  <p className={cx("sr-text-product-label", styles.errorTitle)}>{C.errorTitle}</p>
                  <p className="sr-text-product-caption">{errorDetail(errorMessage)}</p>
                </div>
              ) : null}
              <PrimaryButton
                type="button"
                className={styles.cta}
                disabled={!canSubmit}
                onClick={submit}
                data-testid="remake-intent-submit"
              >
                {generating ? C.creating : phase === "error" ? C.tryAgain : C.create}
              </PrimaryButton>
              {generating ? (
                <p className={cx("sr-text-product-caption", styles.secondary)} role="status">
                  {C.generatingNote}
                </p>
              ) : null}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
