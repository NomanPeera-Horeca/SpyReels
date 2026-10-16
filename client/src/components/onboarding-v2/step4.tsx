/**
 * Step 4: Goal, Audience, Pillars (build plan version, CEO decision
 * 2026-10-16; Figma 4a fallback frame 1293:19647, 4b 1216:178, 4c 1216:106).
 *
 * Presentational. Values come from the server; nothing here invents a value
 * or a number. A pillar shows its "% of views" tile only when the value is
 * measured (performance_backed) and present. Every screen can be confirmed
 * or skipped with the user's own values, whatever the AI did.
 */
import { useId, useState, type ReactNode } from "react";
import type {
  AudiencePayload,
  GoalPayload,
  LanguagePayload,
  NichePayload,
  PersonalizationStep,
  PillarPayload,
  SocialPlatform,
} from "@shared/personalization/model";
import { nicheSlugFromLabel } from "@shared/personalization/growthNiches";
import { formatProfileCount } from "@shared/personalization/publicProfilePreview";
import { AnalysisStatusLine } from "@/design-system/AnalysisStatus";
import { FieldInput, PrimaryButton, SecondaryButton } from "@/design-system/core";
import { GhostButton } from "@/design-system/GhostButton";
import { IconAiSparkle } from "@/design-system/icons";
import { OnboardingShell } from "@/design-system/OnboardingShell";
import { PersonalizationStepper } from "@/design-system/PersonalizationStepper";
import { PlatformFullColorMark } from "@/design-system/platformMarks";
import { COPY } from "./copy";
import styles from "./step4.module.css";

const P = COPY.personalization;

export type StepItem<T> = {
  id: string;
  payload: T;
  status: "suggested" | "confirmed";
  evidence: "performance_backed" | "profile_inferred" | "user_provided";
};

/** Real job state for this step's suggestions. */
export type AiState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "failed" }
  | { state: "clarify"; question: string };

type Common = {
  busy: boolean;
  preview: ReactNode;
  /** Shown only when suggestions were built from analyzed posts. */
  fromPosts: boolean;
  ai: AiState;
  onBack: () => void;
  onSkip: () => void;
  onConfirm: () => void;
  onStepSelect: (step: PersonalizationStep) => void;
};

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable={false}>
      <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable={false}>
      <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StepFrame({
  step,
  title,
  mainLabel,
  common,
  canConfirm,
  children,
}: {
  step: PersonalizationStep;
  title: string;
  mainLabel: string;
  common: Common;
  canConfirm: boolean;
  children: ReactNode;
}) {
  const end = (
    <>
      <GhostButton onClick={common.onSkip} disabled={common.busy} className={styles.skip}>
        {P.skip}
      </GhostButton>
      <PrimaryButton
        onClick={common.onConfirm}
        disabled={common.busy || !canConfirm}
        aria-busy={common.busy}
        className={styles.main}
      >
        {mainLabel}
      </PrimaryButton>
    </>
  );
  return (
    <OnboardingShell
      onBack={common.onBack}
      preview={common.preview}
      contentWidth="wide"
      actions={
        <div className={styles.actionsRow}>
          <GhostButton onClick={common.onBack} leadingIcon={<ChevronLeft />}>
            {COPY.back}
          </GhostButton>
          <div className={styles.actionsEnd}>{end}</div>
        </div>
      }
      mobileActions={end}
      testId={`onboarding-step-${step}`}
    >
      <PersonalizationStepper current={step} onSelect={common.onStepSelect} />
      <div className={styles.header}>
        <h1 className={["sr-text-product-heading-1", styles.title].join(" ")}>{title}</h1>
        <p className={["sr-text-product-body-large", styles.subtitle].join(" ")}>
          {common.fromPosts ? <IconAiSparkle size={16} /> : null}
          {common.fromPosts ? P.subtitleFromPosts : P.subtitle}
        </p>
      </div>
      <div className={styles.content}>
        {common.ai.state === "running" ? (
          <AnalysisStatusLine status="running" handle="" className={styles.aiLine} label={P.thinking} />
        ) : null}
        {common.ai.state === "failed" ? (
          <p className={["sr-text-product-body-small", styles.muted].join(" ")} role="status">
            {P.failed}
          </p>
        ) : null}
        {children}
      </div>
    </OnboardingShell>
  );
}

/* ---------- inline editor ---------- */

type FieldSpec = { key: string; label: string; max: number; required?: boolean; placeholder?: string };

function InlineEditor({
  fields,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  fields: FieldSpec[];
  initial: Record<string, string>;
  busy: boolean;
  onSave: (values: Record<string, string>) => void;
  /** Omitted when there is nothing to go back to (no value yet). */
  onCancel?: () => void;
}) {
  const base = useId();
  const [values, setValues] = useState(initial);
  const valid = fields.every(f => !f.required || (values[f.key] ?? "").trim().length > 0);
  return (
    <form
      className={styles.editor}
      onSubmit={e => {
        e.preventDefault();
        if (valid && !busy) onSave(values);
      }}
    >
      {fields.map((f, i) => (
        <FieldInput
          key={f.key}
          id={`${base}-${f.key}`}
          label={f.label}
          value={values[f.key] ?? ""}
          maxLength={f.max}
          placeholder={f.placeholder}
          autoFocus={i === 0}
          onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
        />
      ))}
      <div className={styles.editorActions}>
        {onCancel ? (
          <GhostButton type="button" onClick={onCancel} disabled={busy}>
            {P.cancel}
          </GhostButton>
        ) : null}
        <PrimaryButton type="submit" disabled={!valid || busy}>
          {P.save}
        </PrimaryButton>
      </div>
    </form>
  );
}

function EditButton({ onClick, label = P.edit }: { onClick: () => void; label?: string }) {
  return (
    <SecondaryButton onClick={onClick} className={styles.editButton}>
      {label}
    </SecondaryButton>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className={styles.remove} onClick={onClick} aria-label={`${P.remove} ${label}`}>
      <CloseIcon />
    </button>
  );
}

/* ---------- 4a Goal ---------- */

export type ProfileSummary = {
  displayName: string | null;
  handle: string | null;
  platform: SocialPlatform | null;
  avatarUrl: string | null;
  followerCount: number | null;
};

export function GoalStep({
  common,
  profile,
  goal,
  niche,
  language,
  onSaveGoal,
  onSaveNiche,
  onSaveLanguage,
}: {
  common: Common;
  profile: ProfileSummary;
  goal: StepItem<GoalPayload> | null;
  niche: StepItem<NichePayload> | null;
  language: StepItem<LanguagePayload> | null;
  onSaveGoal: (payload: GoalPayload, itemId: string | null) => void;
  onSaveNiche: (payload: NichePayload, itemId: string | null) => void;
  onSaveLanguage: (payload: LanguagePayload, itemId: string | null) => void;
}) {
  const [editing, setEditing] = useState<"goal" | "niche" | "language" | null>(
    null
  );
  const clarify = common.ai.state === "clarify" ? common.ai.question : null;
  const goalEditorOpen = editing === "goal" || (!goal && (clarify !== null || common.ai.state === "failed"));
  return (
    <StepFrame step="goal" title={P.goal.title} mainLabel={P.goal.main} common={common} canConfirm>
      <section className={styles.card}>
        {goalEditorOpen ? (
          <InlineEditor
            fields={[
              {
                key: "text",
                label: clarify ?? P.goal.sentenceLabel,
                max: 300,
                required: true,
                placeholder: P.goal.placeholder,
              },
            ]}
            initial={{ text: goal?.payload.text ?? "" }}
            busy={common.busy}
            onCancel={goal || editing === "goal" ? () => setEditing(null) : undefined}
            onSave={v => {
              onSaveGoal({ text: v.text.trim() }, goal?.id ?? null);
              setEditing(null);
            }}
          />
        ) : (
          <div className={styles.row}>
            <div className={styles.text}>
              <span className={["sr-text-product-caption", styles.muted].join(" ")}>{P.goal.sentenceLabel}</span>
              <span className={["sr-text-product-body-large", styles.value].join(" ")}>
                {goal?.payload.text ?? P.notSet}
              </span>
            </div>
            <EditButton onClick={() => setEditing("goal")} label={goal ? P.edit : P.add} />
          </div>
        )}
      </section>

      {profile.handle ? (
        <section className={[styles.card, styles.profileCard].join(" ")}>
          {profile.avatarUrl ? (
            <img className={styles.avatar} src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className={styles.avatar} />
          )}
          <div className={styles.text}>
            {profile.displayName ? (
              <span className={["sr-text-product-card-title", styles.value].join(" ")}>{profile.displayName}</span>
            ) : null}
            <span className={["sr-text-product-caption", styles.muted, styles.inline].join(" ")}>
              {profile.platform ? <PlatformFullColorMark platform={profile.platform} size={14} /> : null}
              @{profile.handle}
              {profile.followerCount !== null
                ? ` · ${formatProfileCount(profile.followerCount)} followers`
                : ""}
            </span>
          </div>
        </section>
      ) : null}

      <div className={styles.twoUp}>
        <section className={styles.card}>
          {editing === "niche" ? (
            <InlineEditor
              fields={[{ key: "label", label: P.goal.nicheLabel, max: 60, required: true }]}
              initial={{ label: niche?.payload.label ?? "" }}
              busy={common.busy}
              onCancel={() => setEditing(null)}
              onSave={v => {
                const label = v.label.trim();
                onSaveNiche({ slug: nicheSlugFromLabel(label), label }, niche?.id ?? null);
                setEditing(null);
              }}
            />
          ) : (
            <div className={styles.row}>
              <div className={styles.text}>
                <span className={["sr-text-product-caption", styles.muted].join(" ")}>{P.goal.nicheLabel}</span>
                <span className={["sr-text-product-card-title", styles.value].join(" ")}>
                  {niche?.payload.label ?? P.notSet}
                </span>
              </div>
              <EditButton onClick={() => setEditing("niche")} label={niche ? P.edit : P.add} />
            </div>
          )}
        </section>
        <section className={styles.card}>
          {editing === "language" ? (
            <InlineEditor
              fields={[{ key: "label", label: P.goal.languageLabel, max: 40, required: true }]}
              initial={{ label: language?.payload.label ?? "" }}
              busy={common.busy}
              onCancel={() => setEditing(null)}
              onSave={v => {
                const label = v.label.trim();
                onSaveLanguage({ code: languageCode(label), label }, language?.id ?? null);
                setEditing(null);
              }}
            />
          ) : (
            <div className={styles.row}>
              <div className={styles.text}>
                <span className={["sr-text-product-caption", styles.muted].join(" ")}>{P.goal.languageLabel}</span>
                <span className={["sr-text-product-card-title", styles.value].join(" ")}>
                  {language?.payload.label ?? P.notSet}
                </span>
              </div>
              <EditButton onClick={() => setEditing("language")} label={language ? P.edit : P.add} />
            </div>
          )}
        </section>
      </div>
    </StepFrame>
  );
}

const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  spanish: "es",
  "español": "es",
  portuguese: "pt",
  french: "fr",
  german: "de",
  italian: "it",
  hindi: "hi",
  urdu: "ur",
  arabic: "ar",
};

function languageCode(label: string): string {
  return LANGUAGE_CODES[label.trim().toLowerCase()] ?? "und";
}

/* ---------- 4b Audience ---------- */

export function AudienceStep({
  common,
  audiences,
  onSave,
  onRemove,
}: {
  common: Common;
  audiences: StepItem<AudiencePayload>[];
  onSave: (payload: AudiencePayload, itemId: string | null) => void;
  onRemove: (itemId: string) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const fields: FieldSpec[] = [
    { key: "who", label: P.audience.whoLabel, max: 120, required: true },
    { key: "outcome", label: P.audience.outcomeLabel, max: 160, required: true },
  ];
  return (
    <StepFrame step="audience" title={P.audience.title} mainLabel={P.audience.main} common={common} canConfirm>
      {audiences.map(a =>
        editing === a.id ? (
          <section key={a.id} className={styles.card}>
            <InlineEditor
              fields={fields}
              initial={{ who: a.payload.who, outcome: a.payload.outcome }}
              busy={common.busy}
              onCancel={() => setEditing(null)}
              onSave={v => {
                onSave({ who: v.who.trim(), outcome: v.outcome.trim() }, a.id);
                setEditing(null);
              }}
            />
          </section>
        ) : (
          <section key={a.id} className={[styles.card, styles.row].join(" ")}>
            <p className={["sr-text-product-body-medium", styles.value, styles.sentence].join(" ")}>
              {P.audience.rowPrefix} <strong>{a.payload.who}</strong> {P.audience.rowMiddle}{" "}
              <strong>{a.payload.outcome}</strong>
            </p>
            <EditButton onClick={() => setEditing(a.id)} />
            <RemoveButton onClick={() => onRemove(a.id)} label={a.payload.who} />
          </section>
        )
      )}
      {editing === "new" ? (
        <section className={styles.card}>
          <InlineEditor
            fields={fields}
            initial={{ who: "", outcome: "" }}
            busy={common.busy}
            onCancel={() => setEditing(null)}
            onSave={v => {
              onSave({ who: v.who.trim(), outcome: v.outcome.trim() }, null);
              setEditing(null);
            }}
          />
        </section>
      ) : (
        <button type="button" className={styles.addButton} onClick={() => setEditing("new")}>
          {P.audience.add}
        </button>
      )}
    </StepFrame>
  );
}

/* ---------- 4c Pillars ---------- */

export function PillarsStep({
  common,
  pillars,
  onSave,
  onRemove,
}: {
  common: Common;
  pillars: StepItem<PillarPayload>[];
  onSave: (payload: Omit<PillarPayload, "viewSharePercent">, itemId: string | null) => void;
  onRemove: (itemId: string) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const fields: FieldSpec[] = [
    { key: "title", label: P.pillars.titleLabel, max: 80, required: true },
    { key: "description", label: P.pillars.descriptionLabel, max: 200 },
  ];
  return (
    <StepFrame step="pillars" title={P.pillars.title} mainLabel={P.pillars.main} common={common} canConfirm>
      {pillars.map(p => {
        const measured =
          p.evidence === "performance_backed" && typeof p.payload.viewSharePercent === "number";
        return editing === p.id ? (
          <section key={p.id} className={styles.card}>
            <InlineEditor
              fields={fields}
              initial={{ title: p.payload.title, description: p.payload.description }}
              busy={common.busy}
              onCancel={() => setEditing(null)}
              onSave={v => {
                onSave({ title: v.title.trim(), description: v.description.trim() }, p.id);
                setEditing(null);
              }}
            />
          </section>
        ) : (
          <section key={p.id} className={[styles.card, styles.row].join(" ")}>
            {measured ? (
              <span className={styles.share}>
                <span className={["sr-text-product-heading-4", styles.shareValue].join(" ")}>
                  {Math.round(p.payload.viewSharePercent!)}%
                </span>
                <span className={["sr-text-product-caption", styles.shareLabel].join(" ")}>{P.pillars.ofViews}</span>
              </span>
            ) : null}
            <div className={styles.text}>
              <span className={["sr-text-product-card-title", styles.value].join(" ")}>{p.payload.title}</span>
              {p.payload.description ? (
                <span className={["sr-text-product-body-small", styles.muted].join(" ")}>{p.payload.description}</span>
              ) : null}
            </div>
            <EditButton onClick={() => setEditing(p.id)} />
            <RemoveButton onClick={() => onRemove(p.id)} label={p.payload.title} />
          </section>
        );
      })}
      {editing === "new" ? (
        <section className={styles.card}>
          <InlineEditor
            fields={fields}
            initial={{ title: "", description: "" }}
            busy={common.busy}
            onCancel={() => setEditing(null)}
            onSave={v => {
              onSave({ title: v.title.trim(), description: v.description.trim() }, null);
              setEditing(null);
            }}
          />
        </section>
      ) : (
        <button type="button" className={styles.addButton} onClick={() => setEditing("new")}>
          {P.pillars.add}
        </button>
      )}
    </StepFrame>
  );
}
