/**
 * Onboarding v2 steps 1 to 3b plus "I don't post yet" (Figma page 15).
 * Presentational only: every value and handler comes from the flow
 * container, so the same screens render in the dev preview with fixtures.
 *
 * Classification: NEW pages built from REUSED core components (Primary
 * button and Field input shared with the marketing site, Card / Selectable,
 * Card / Goal Option, Button / Ghost, Onboarding Shell).
 */
import { useId, type ReactNode } from "react";
import type {
  AnalysisRunStatus,
  AttributionSource,
  PrimaryUseCase,
  SocialPlatform,
} from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { AnalysisStatusLine } from "@/design-system/AnalysisStatus";
import { CardSelectable } from "@/design-system/CardSelectable";
import { FieldInput, PrimaryButton, SecondaryButton } from "@/design-system/core";
import { GhostButton } from "@/design-system/GhostButton";
import { GoalOption } from "@/design-system/GoalOption";
import {
  IconAiSparkle,
  IconToolCreators,
  IconToolFinder,
  IconToolScript,
} from "@/design-system/icons";
import { OnboardingShell } from "@/design-system/OnboardingShell";
import { PlatformFullColorMark } from "@/design-system/platformMarks";
import {
  ATTRIBUTION_OPTIONS,
  COPY,
  GROWTH_NICHE_OPTIONS,
  PLATFORM_LABEL,
  USE_CASE_OPTIONS,
} from "./copy";
import {
  CONTENT_PURPOSE_OPTIONS,
  STARTER_AUDIENCE_CHIPS,
  STARTER_AUDIENCE_MAX,
  STARTER_TOPIC_CHIPS,
  STARTER_TOPIC_MAX,
  type ContentPurpose,
} from "@shared/personalization/starterQuestions";
import styles from "./OnboardingSteps.module.css";

export type PlatformError = keyof typeof COPY.platform.errors;

const PLATFORMS: SocialPlatform[] = ["instagram", "tiktok", "youtube"];

const USE_CASE_ICON: Record<PrimaryUseCase, ReactNode> = {
  find_viral_videos: <IconToolFinder />,
  scripts_in_my_voice: <IconToolScript />,
  analyze_creators: <IconToolCreators />,
  ideas_what_to_post: <IconAiSparkle />,
};

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className={styles.header}>
      <h1 className={["sr-text-product-heading-1", styles.title].join(" ")}>{title}</h1>
      {subtitle ? (
        <p className={["sr-text-product-body-large", styles.subtitle].join(" ")}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <GhostButton onClick={onClick} leadingIcon={<ChevronLeft />}>
      {COPY.back}
    </GhostButton>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable={false}>
      <path
        d="M12.5 15L7.5 10L12.5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- Step 1: Where do you post? ---------- */

const RETRYABLE_PLATFORM_ERRORS = new Set<PlatformError>(["timeout", "error", "rate_limited"]);
/** When we cannot find or read the account, the "no posts" path becomes the way forward. */
const NO_PROFILE_ERRORS = new Set<PlatformError>(["not_found", "unavailable", "private"]);

function shownHandle(value: string): string {
  const handle = value.trim().replace(/^@+/, "");
  return handle ? `@${handle}` : "";
}

export function PlatformStep({
  platform,
  handleInput,
  error,
  busy,
  looking = false,
  slow = false,
  preview,
  onPlatform,
  onHandleInput,
  onContinue,
  onCancel,
  onNoPost,
}: {
  platform: SocialPlatform | null;
  handleInput: string;
  error: PlatformError | null;
  busy: boolean;
  /** The profile request is in flight. The form stays usable enough to cancel or edit. */
  looking?: boolean;
  /** True only while that same request is still open after the slow threshold. */
  slow?: boolean;
  preview: ReactNode;
  onPlatform: (p: SocialPlatform) => void;
  onHandleInput: (v: string) => void;
  onContinue: () => void;
  onCancel?: () => void;
  onNoPost: () => void;
}) {
  const inputId = useId();
  const canContinue = Boolean(platform) && handleInput.trim().length > 0 && !busy && !looking;
  const retryable = Boolean(error && RETRYABLE_PLATFORM_ERRORS.has(error));
  const errorText =
    error === "timeout" && platform
      ? COPY.platform.slow[platform]
      : error
        ? COPY.platform.errors[error]
        : undefined;
  const actions = (
    <div className={styles.actionsRow}>
      <GhostButton onClick={onNoPost} disabled={busy} className={styles.ghostStart}>
        {error && NO_PROFILE_ERRORS.has(error) ? COPY.platform.continueWithout : COPY.platform.noPost}
      </GhostButton>
      {looking ? (
        <SecondaryButton type="button" onClick={onCancel}>
          {COPY.platform.cancel}
        </SecondaryButton>
      ) : (
        <PrimaryButton onClick={onContinue} disabled={!canContinue} aria-busy={busy}>
          {retryable ? COPY.platform.retry : COPY.platform.continue}
        </PrimaryButton>
      )}
    </div>
  );
  return (
    <OnboardingShell
      actions={actions}
      mobileActions={actions}
      preview={preview}
      actionsPlacement="inline"
      testId="onboarding-step-platform"
    >
      <form
        onSubmit={e => {
          e.preventDefault();
          if (canContinue) onContinue();
        }}
      >
        <StepHeader title={COPY.platform.title} subtitle={COPY.platform.subtitle} />
        <div className={styles.stack}>
          <div className={styles.platformRow} role="radiogroup" aria-label="Platform">
            {PLATFORMS.map(p => (
              <CardSelectable
                key={p}
                selected={platform === p}
                onClick={() => onPlatform(p)}
                className={styles.platformTile}
              >
                <PlatformFullColorMark platform={p} size={20} />
                <span className={["sr-text-product-card-title", styles.platformLabel].join(" ")}>
                  {PLATFORM_LABEL[p]}
                </span>
              </CardSelectable>
            ))}
          </div>
          <FieldInput
            id={inputId}
            label={COPY.platform.fieldLabel}
            placeholder={COPY.platform.placeholder}
            value={handleInput}
            onChange={e => onHandleInput(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            error={errorText}
            disabled={busy}
          />
          {looking && platform ? (
            <div className={styles.lookupStatus}>
              <AnalysisStatusLine
                status="running"
                label={COPY.platform.finding[platform]}
                handle={shownHandle(handleInput)}
              />
              {slow ? (
                <p className={["sr-text-product-body-small", styles.subtitle].join(" ")}>
                  {COPY.platform.slow[platform]}
                </p>
              ) : null}
            </div>
          ) : null}
          <button type="submit" className={styles.srOnly} tabIndex={-1} aria-hidden>
            {COPY.platform.continue}
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}

/* ---------- Step 2: Is this you? ---------- */

export function ProfileStep({
  busy,
  preview,
  mobilePreview,
  onBack,
  onNotMe,
  onConfirm,
}: {
  profile: PublicProfilePreview;
  busy: boolean;
  preview: ReactNode;
  /** Mobile shows the visitor view inline (there is no right panel). */
  mobilePreview: ReactNode;
  onBack: () => void;
  onNotMe: () => void;
  onConfirm: () => void;
}) {
  return (
    <OnboardingShell
      onBack={onBack}
      preview={preview}
      actions={
        <div className={styles.actionsRow}>
          <BackButton onClick={onBack} />
          <div className={styles.actionsEnd}>
            <SecondaryButton onClick={onNotMe} disabled={busy}>
              {COPY.profile.notMe}
            </SecondaryButton>
            <PrimaryButton onClick={onConfirm} disabled={busy} aria-busy={busy}>
              {COPY.profile.thatsMe}
            </PrimaryButton>
          </div>
        </div>
      }
      mobileActions={false}
      testId="onboarding-step-profile"
    >
      <StepHeader title={COPY.profile.title} subtitle={COPY.profile.subtitle} />
      <div className={styles.mobileOnly}>{mobilePreview}</div>
      <div className={styles.mobileChoice}>
        <SecondaryButton onClick={onNotMe} disabled={busy}>
          {COPY.profile.notMe}
        </SecondaryButton>
        <PrimaryButton onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {COPY.profile.thatsMe}
        </PrimaryButton>
      </div>
    </OnboardingShell>
  );
}

/** Real analysis status for the typed handle, with "Try again" only after a real failure. */
function RunStatus({
  handle,
  runStatus,
  onRetry,
  busy,
}: {
  handle: string | null;
  runStatus: AnalysisRunStatus | null;
  onRetry?: () => void;
  busy: boolean;
}) {
  if (!handle || !runStatus) return null;
  return (
    <div className={styles.statusRow}>
      <AnalysisStatusLine status={runStatus} handle={`@${handle}`} />
      {runStatus === "failed" && onRetry ? (
        <GhostButton onClick={onRetry} disabled={busy}>
          {COPY.tryAgain}
        </GhostButton>
      ) : null}
    </div>
  );
}

/* ---------- Step 3a: What brings you to SpyReels? ---------- */

export function UseCaseStep({
  handle,
  runStatus,
  onRetry,
  value,
  busy,
  preview,
  onChange,
  onBack,
  onContinue,
}: {
  /** As the user typed it, without @. Null for "I don't post yet". */
  handle: string | null;
  runStatus: AnalysisRunStatus | null;
  /** Shown only when the real analysis failed. */
  onRetry?: () => void;
  value: PrimaryUseCase | null;
  busy: boolean;
  preview: ReactNode;
  onChange: (v: PrimaryUseCase) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const continueButton = (
    <PrimaryButton onClick={onContinue} disabled={!value || busy} aria-busy={busy}>
      {COPY.continue}
    </PrimaryButton>
  );
  return (
    <OnboardingShell
      onBack={onBack}
      preview={preview}
      contentWidth="wide"
      actions={
        <div className={styles.actionsRow}>
          <BackButton onClick={onBack} />
          {continueButton}
        </div>
      }
      mobileActions={continueButton}
      testId="onboarding-step-use-case"
    >
      <RunStatus handle={handle} runStatus={runStatus} onRetry={onRetry} busy={busy} />
      <StepHeader title={COPY.useCase.title} subtitle={COPY.useCase.subtitle} />
      <div className={styles.options} role="radiogroup" aria-label={COPY.useCase.title}>
        {USE_CASE_OPTIONS.map(o => (
          <GoalOption
            key={o.value}
            title={o.title}
            description={o.description}
            icon={USE_CASE_ICON[o.value]}
            selected={value === o.value}
            onClick={() => onChange(o.value)}
          />
        ))}
      </div>
    </OnboardingShell>
  );
}

/* ---------- Step 3b: How did you hear about us? (optional) ---------- */

export function AttributionStep({
  handle,
  runStatus,
  onRetry,
  value,
  busy,
  preview,
  onChange,
  onBack,
  onSkip,
  onContinue,
}: {
  handle: string | null;
  runStatus: AnalysisRunStatus | null;
  /** Shown only when the real analysis failed. */
  onRetry?: () => void;
  value: AttributionSource | null;
  busy: boolean;
  preview: ReactNode;
  onChange: (v: AttributionSource) => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const end = (
    <>
      <GhostButton onClick={onSkip} disabled={busy}>
        {COPY.attribution.skip}
      </GhostButton>
      <PrimaryButton onClick={onContinue} disabled={!value || busy} aria-busy={busy}>
        {COPY.continue}
      </PrimaryButton>
    </>
  );
  return (
    <OnboardingShell
      onBack={onBack}
      preview={preview}
      contentWidth="wide"
      actions={
        <div className={styles.actionsRow}>
          <BackButton onClick={onBack} />
          <div className={styles.actionsEnd}>{end}</div>
        </div>
      }
      mobileActions={end}
      testId="onboarding-step-attribution"
    >
      <RunStatus handle={handle} runStatus={runStatus} onRetry={onRetry} busy={busy} />
      <StepHeader title={COPY.attribution.title} subtitle={COPY.attribution.subtitle} />
      <div className={styles.optionsGrid} role="radiogroup" aria-label={COPY.attribution.title}>
        {ATTRIBUTION_OPTIONS.map(o => (
          <GoalOption
            key={o.value}
            title={o.label}
            selected={value === o.value}
            onClick={() => onChange(o.value)}
          />
        ))}
      </div>
    </OnboardingShell>
  );
}

/* ---------- Starter questions: no posts yet, or nothing public to read ---------- */

function ChipRow({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string | null;
  onPick: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className={styles.chipRow} role="radiogroup" aria-label={label}>
      {options.map(o => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onPick(o.value)}
            className={[styles.chip, selected ? styles.chipSelected : ""].join(" ")}
          >
            <span className="sr-text-product-body-small">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StarterQuestionsStep({
  topic,
  audience,
  purpose,
  busy,
  preview,
  onTopic,
  onAudience,
  onPurpose,
  onBack,
  onSkip,
  onContinue,
}: {
  topic: string;
  audience: string;
  purpose: ContentPurpose | null;
  busy: boolean;
  preview: ReactNode;
  onTopic: (v: string) => void;
  onAudience: (v: string) => void;
  onPurpose: (v: ContentPurpose) => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const topicId = useId();
  const audienceId = useId();
  const answered = Boolean(topic.trim() || audience.trim() || purpose);
  const end = (
    <>
      <GhostButton onClick={onSkip} disabled={busy}>
        {COPY.starter.skip}
      </GhostButton>
      <PrimaryButton onClick={onContinue} disabled={!answered || busy} aria-busy={busy}>
        {COPY.continue}
      </PrimaryButton>
    </>
  );
  const chips = (list: readonly string[]) => list.map(v => ({ value: v, label: v }));
  return (
    <OnboardingShell
      onBack={onBack}
      preview={preview}
      contentWidth="wide"
      actions={
        <div className={styles.actionsRow}>
          <BackButton onClick={onBack} />
          <div className={styles.actionsEnd}>{end}</div>
        </div>
      }
      mobileActions={end}
      testId="onboarding-step-starter"
    >
      <StepHeader title={COPY.starter.title} subtitle={COPY.starter.subtitle} />
      <div className={styles.starterBlock}>
        <FieldInput
          id={topicId}
          label={COPY.starter.topicLabel}
          placeholder={COPY.starter.topicPlaceholder}
          value={topic}
          maxLength={STARTER_TOPIC_MAX}
          onChange={e => onTopic(e.target.value)}
          disabled={busy}
        />
        <p className={["sr-text-product-body-small", styles.chipHint].join(" ")}>{COPY.starter.examples}</p>
        <ChipRow label={COPY.starter.topicLabel} options={chips(STARTER_TOPIC_CHIPS)} value={topic} onPick={onTopic} disabled={busy} />
      </div>
      <div className={styles.starterBlock}>
        <FieldInput
          id={audienceId}
          label={COPY.starter.audienceLabel}
          placeholder={COPY.starter.audiencePlaceholder}
          value={audience}
          maxLength={STARTER_AUDIENCE_MAX}
          onChange={e => onAudience(e.target.value)}
          disabled={busy}
        />
        <p className={["sr-text-product-body-small", styles.chipHint].join(" ")}>{COPY.starter.examples}</p>
        <ChipRow label={COPY.starter.audienceLabel} options={chips(STARTER_AUDIENCE_CHIPS)} value={audience} onPick={onAudience} disabled={busy} />
      </div>
      <div className={styles.starterBlock}>
        <p className={["sr-text-product-label", styles.starterQuestion].join(" ")}>{COPY.starter.purposeLabel}</p>
        <ChipRow
          label={COPY.starter.purposeLabel}
          options={CONTENT_PURPOSE_OPTIONS}
          value={purpose}
          onPick={v => onPurpose(v as ContentPurpose)}
          disabled={busy}
        />
      </div>
    </OnboardingShell>
  );
}

/* ---------- "I don't post yet": What do you want to grow in? ---------- */

export function GrowthNicheStep({
  value,
  busy,
  preview,
  onChange,
  onBack,
  onContinue,
}: {
  value: string | null;
  busy: boolean;
  preview: ReactNode;
  onChange: (slug: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const continueButton = (
    <PrimaryButton onClick={onContinue} disabled={!value || busy} aria-busy={busy}>
      {COPY.continue}
    </PrimaryButton>
  );
  return (
    <OnboardingShell
      onBack={onBack}
      preview={preview}
      actions={
        <div className={styles.actionsRow}>
          <BackButton onClick={onBack} />
          {continueButton}
        </div>
      }
      mobileActions={continueButton}
      testId="onboarding-step-growth-niche"
    >
      <StepHeader title={COPY.niche.title} />
      <div className={styles.nicheGrid} role="radiogroup" aria-label={COPY.niche.title}>
        {GROWTH_NICHE_OPTIONS.map(o => (
          <CardSelectable
            key={o.slug}
            selected={value === o.slug}
            onClick={() => onChange(o.slug)}
            className={styles.nicheTile}
          >
            <span className="sr-text-product-body-small">{o.label}</span>
          </CardSelectable>
        ))}
      </div>
    </OnboardingShell>
  );
}
