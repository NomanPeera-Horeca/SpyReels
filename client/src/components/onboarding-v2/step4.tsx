/**
 * Step 4: Goal, Audience, Pillars. Approved Figma: Goal desktop 1080:3458,
 * Audience desktop 1216:178, Audience mobile 1413:4427, Pillars desktop
 * 1216:106. Mobile Goal (1080:4452) and mobile Pillars (1216:18669) are
 * REVIEW PENDING in Figma: they reflow this same structure.
 *
 * Presentational. Values come from the server; nothing here invents a value
 * or a number. Every screen can be confirmed or skipped with the user's own
 * values, whatever the AI did. Edits go through the server, which supersedes
 * (never overwrites) a confirmed value.
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
import { AnalysisStatusLine } from "@/design-system/AnalysisStatus";
import { FieldInput, PrimaryButton } from "@/design-system/core";
import { GhostButton } from "@/design-system/GhostButton";
import { IconPencil, IconPillar, IconTrash } from "@/design-system/icons";
import { OnboardingShell } from "@/design-system/OnboardingShell";
import { PersonalizationStepper } from "@/design-system/PersonalizationStepper";
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
  /** Suggestions were built from analyzed posts (kept for callers; the approved subtitle is per step). */
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

function StepFrame({
  step,
  title,
  subtitle,
  mainLabel,
  common,
  canConfirm,
  children,
}: {
  step: PersonalizationStep;
  title: string;
  subtitle: string;
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
        <p className={["sr-text-product-body-large", styles.subtitle].join(" ")}>{subtitle}</p>
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
  onRemove,
  removeLabel,
}: {
  fields: FieldSpec[];
  initial: Record<string, string>;
  busy: boolean;
  onSave: (values: Record<string, string>) => Promise<boolean>;
  /** Omitted when there is nothing to go back to (no value yet). */
  onCancel?: () => void;
  /** Group edit mode only: remove this value (never shown on a chip). */
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const base = useId();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const submitting = busy || saving;
  const valid = fields.every(f => !f.required || (values[f.key] ?? "").trim().length > 0);
  return (
    <form
      className={styles.editor}
      onSubmit={async e => {
        e.preventDefault();
        if (!valid || submitting) return;
        setSaving(true);
        try { await onSave(values); } finally { setSaving(false); }
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
        {onRemove ? (
          <GhostButton
            type="button"
            onClick={onRemove}
            disabled={submitting}
            className={styles.editorRemove}
            aria-label={removeLabel ? `${P.remove} ${removeLabel}` : P.remove}
          >
            {P.remove}
          </GhostButton>
        ) : null}
        {onCancel ? (
          <GhostButton type="button" onClick={onCancel} disabled={submitting}>
            {P.cancel}
          </GhostButton>
        ) : null}
        <PrimaryButton type="submit" disabled={!valid || submitting}>
          {P.save}
        </PrimaryButton>
      </div>
    </form>
  );
}

/* ---------- shared actions (Figma "Action / Edit / Pencil + Label", trash) ---------- */

/** Pencil + "Edit", 44px tall tap target (Figma 1450:4488). */
function EditAction({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={styles.editAction}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${P.edit} ${label}`}
    >
      <IconPencil size={16} />
      <span>{P.edit}</span>
    </button>
  );
}

/** Muted red trash, 20px icon in a 44px tap target (Figma 1437:4522 / 1437:4524). */
function TrashAction({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={styles.trashAction}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${P.remove} ${label}`}
    >
      <IconTrash size={20} />
    </button>
  );
}

/* ---------- chip group (Goals 1080:3458, Audience 1216:178 / 1413:4427) ---------- */

type ChipItem = { id: string; label: string; initial: Record<string, string> };

function ChipGroup({
  groupLabel,
  items,
  addLabel,
  max,
  min = 0,
  busy,
  fields,
  emptyInitial,
  autoOpenAdd = false,
  onSave,
  onRemove,
}: {
  groupLabel: string;
  items: ChipItem[];
  addLabel: string;
  max?: number;
  min?: number;
  busy: boolean;
  fields: FieldSpec[];
  emptyInitial: Record<string, string>;
  /** Open the add form straight away (no value yet and the AI asked or failed). */
  autoOpenAdd?: boolean;
  onSave: (values: Record<string, string>, itemId: string | null) => Promise<boolean>;
  onRemove: (itemId: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [editingId, setEditingId] = useState<string | null>(null);
  const adding = mode === "add" || (autoOpenAdd && items.length === 0 && mode === "view");
  const canAdd = max === undefined || items.length < max;
  const canRemove = items.length > min;

  if (mode === "edit") {
    return (
      <section className={[styles.card, styles.group].join(" ")} aria-label={groupLabel}>
        <ul className={styles.editList}>
          {items.map(item =>
            editingId === item.id ? (
              <li key={item.id} className={styles.editListItem}>
                <InlineEditor
                  key={item.id}
                  fields={fields}
                  initial={item.initial}
                  busy={busy}
                  onCancel={() => setEditingId(null)}
                  onRemove={
                    canRemove
                      ? () => {
                          onRemove(item.id);
                          setEditingId(null);
                        }
                      : undefined
                  }
                  removeLabel={item.label}
                  onSave={async v => {
                    const saved = await onSave(v, item.id);
                    if (saved) setEditingId(null);
                    return saved;
                  }}
                />
              </li>
            ) : (
              <li key={item.id} className={[styles.editListItem, styles.editListRow].join(" ")}>
                <span className={["sr-text-product-body-large", styles.editListText].join(" ")}>{item.label}</span>
                <EditAction onClick={() => setEditingId(item.id)} label={item.label} disabled={busy} />
              </li>
            )
          )}
        </ul>
        <div className={styles.groupActions}>
          <span />
          <GhostButton
            type="button"
            onClick={() => {
              setEditingId(null);
              setMode("view");
            }}
          >
            {P.done}
          </GhostButton>
        </div>
      </section>
    );
  }

  return (
    <section className={[styles.card, styles.group].join(" ")} aria-label={groupLabel}>
      {items.length ? (
        <ul className={styles.chips}>
          {items.map(item => (
            <li key={item.id} className={styles.chip}>
              {item.label}
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className={["sr-text-product-body-small", styles.muted].join(" ")}>{P.notSet}</p>
      ) : null}
      {adding ? (
        <InlineEditor
          key="new"
          fields={fields}
          initial={emptyInitial}
          busy={busy}
          onCancel={items.length || mode === "add" ? () => setMode("view") : undefined}
          onSave={async v => {
            const saved = await onSave(v, null);
            if (saved) setMode("view");
            return saved;
          }}
        />
      ) : (
        <div className={styles.groupActions}>
          {canAdd ? (
            <button type="button" className={styles.textAction} onClick={() => setMode("add")} disabled={busy}>
              {addLabel}
            </button>
          ) : (
            <span />
          )}
          {items.length ? <EditAction onClick={() => setMode("edit")} label={groupLabel} disabled={busy} /> : null}
        </div>
      )}
    </section>
  );
}

/* ---------- labelled value with Edit (Niche, Language) ---------- */

function ValueCard({
  label,
  value,
  editing,
  busy,
  max,
  className,
  onEdit,
  onCancel,
  onSave,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  busy: boolean;
  max: number;
  className?: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => Promise<boolean>;
}) {
  return (
    <section className={[styles.card, styles.valueCard, className ?? ""].join(" ")}>
      {editing ? (
        <InlineEditor
          fields={[{ key: "label", label, max, required: true }]}
          initial={{ label: value ?? "" }}
          busy={busy}
          onCancel={onCancel}
          onSave={v => onSave(v.label.trim())}
        />
      ) : (
        <div className={styles.row}>
          <div className={styles.text}>
            <span className={["sr-text-product-caption", styles.caption].join(" ")}>{label}</span>
            <span className={["sr-text-product-card-title", styles.value].join(" ")}>{value ?? P.notSet}</span>
          </div>
          <EditAction onClick={onEdit} label={label} disabled={busy} />
        </div>
      )}
    </section>
  );
}

/* ---------- 4a Goal (1080:3458) ---------- */

export type ProfileSummary = {
  displayName: string | null;
  handle: string | null;
  platform: SocialPlatform | null;
  avatarUrl: string | null;
  followerCount: number | null;
};

export const MAX_GOALS = 5;

export function GoalStep({
  common,
  goals,
  niche,
  language,
  onSaveGoal,
  onRemoveGoal,
  onSaveNiche,
  onSaveLanguage,
}: {
  common: Common;
  goals: StepItem<GoalPayload>[];
  niche: StepItem<NichePayload> | null;
  language: StepItem<LanguagePayload> | null;
  onSaveGoal: (payload: GoalPayload, itemId: string | null) => Promise<boolean>;
  onRemoveGoal: (itemId: string) => void;
  onSaveNiche: (payload: NichePayload, itemId: string | null) => Promise<boolean>;
  onSaveLanguage: (payload: LanguagePayload, itemId: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<"niche" | "language" | null>(null);
  const clarify = common.ai.state === "clarify" ? common.ai.question : null;
  return (
    <StepFrame
      step="goal"
      title={P.goal.title}
      subtitle={P.goal.subtitle}
      mainLabel={P.goal.main}
      common={common}
      canConfirm
    >
      <ChipGroup
        groupLabel={P.goal.groupLabel}
        items={goals.map(g => ({ id: g.id, label: g.payload.text, initial: { text: g.payload.text } }))}
        addLabel={P.goal.add}
        max={MAX_GOALS}
        min={1}
        busy={common.busy}
        fields={[
          { key: "text", label: clarify ?? P.goal.fieldLabel, max: 300, required: true, placeholder: P.goal.placeholder },
        ]}
        emptyInitial={{ text: "" }}
        autoOpenAdd={clarify !== null || common.ai.state === "failed"}
        onSave={(v, id) => onSaveGoal({ text: v.text.trim() }, id)}
        onRemove={onRemoveGoal}
      />
      <div className={styles.twoUp}>
        <ValueCard
          label={P.goal.nicheLabel}
          value={niche?.payload.label ?? null}
          editing={editing === "niche"}
          busy={common.busy}
          max={60}
          onEdit={() => setEditing("niche")}
          onCancel={() => setEditing(null)}
          onSave={async label => {
            const saved = await onSaveNiche({ slug: nicheSlugFromLabel(label), label }, niche?.id ?? null);
            if (saved) setEditing(null);
            return saved;
          }}
        />
        <ValueCard
          label={P.goal.languageLabel}
          value={language?.payload.label ?? null}
          editing={editing === "language"}
          busy={common.busy}
          max={40}
          className={styles.languageCard}
          onEdit={() => setEditing("language")}
          onCancel={() => setEditing(null)}
          onSave={async label => {
            const saved = await onSaveLanguage({ code: languageCode(label), label }, language?.id ?? null);
            if (saved) setEditing(null);
            return saved;
          }}
        />
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

/* ---------- 4b Audience (1216:178, mobile 1413:4427) ---------- */

export function AudienceStep({
  common,
  audiences,
  onSave,
  onRemove,
}: {
  common: Common;
  audiences: StepItem<AudiencePayload>[];
  onSave: (payload: AudiencePayload, itemId: string | null) => Promise<boolean>;
  onRemove: (itemId: string) => void;
}) {
  // The chip shows who. The saved value keeps both parts (who, outcome), so
  // the form still asks for both; the server requires them.
  const fields: FieldSpec[] = [
    { key: "who", label: P.audience.whoLabel, max: 120, required: true },
    { key: "outcome", label: P.audience.outcomeLabel, max: 160, required: true },
  ];
  return (
    <StepFrame
      step="audience"
      title={P.audience.title}
      subtitle={P.audience.subtitle}
      mainLabel={P.audience.main}
      common={common}
      canConfirm
    >
      <ChipGroup
        groupLabel={P.audience.groupLabel}
        items={audiences.map(a => ({
          id: a.id,
          label: a.payload.who,
          initial: { who: a.payload.who, outcome: a.payload.outcome },
        }))}
        addLabel={P.audience.add}
        busy={common.busy}
        fields={fields}
        emptyInitial={{ who: "", outcome: "" }}
        autoOpenAdd={common.ai.state === "failed" || common.ai.state === "clarify"}
        onSave={(v, id) => onSave({ who: v.who.trim(), outcome: v.outcome.trim() }, id)}
        onRemove={onRemove}
      />
    </StepFrame>
  );
}

/* ---------- 4c Pillars (1216:106) ---------- */

export function PillarsStep({
  common,
  pillars,
  onSave,
  onRemove,
}: {
  common: Common;
  pillars: StepItem<PillarPayload>[];
  onSave: (payload: Omit<PillarPayload, "viewSharePercent">, itemId: string | null) => Promise<boolean>;
  onRemove: (itemId: string) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const fields: FieldSpec[] = [
    { key: "title", label: P.pillars.titleLabel, max: 80, required: true },
    { key: "description", label: P.pillars.descriptionLabel, max: 200 },
  ];
  return (
    <StepFrame
      step="pillars"
      title={P.pillars.title}
      subtitle={P.pillars.subtitle}
      mainLabel={P.pillars.main}
      common={common}
      canConfirm
    >
      {pillars.map(p =>
        editing === p.id ? (
          <section key={p.id} className={styles.card}>
            <InlineEditor
              fields={fields}
              initial={{ title: p.payload.title, description: p.payload.description }}
              busy={common.busy}
              onCancel={() => setEditing(null)}
              onSave={async v => {
                const saved = await onSave({ title: v.title.trim(), description: v.description.trim() }, p.id);
                if (saved) setEditing(null);
                return saved;
              }}
            />
          </section>
        ) : (
          <section key={p.id} className={[styles.card, styles.pillarCard].join(" ")}>
            <span className={styles.pillarTile}>
              <IconPillar size={24} />
            </span>
            <div className={styles.pillarText}>
              <span className={["sr-text-product-card-title", styles.value].join(" ")}>{p.payload.title}</span>
              {p.payload.description ? (
                <span className={["sr-text-product-body-small", styles.muted, styles.clamp2].join(" ")}>
                  {p.payload.description}
                </span>
              ) : null}
            </div>
            <div className={styles.pillarActions}>
              <EditAction onClick={() => setEditing(p.id)} label={p.payload.title} disabled={common.busy} />
              <TrashAction onClick={() => onRemove(p.id)} label={p.payload.title} disabled={common.busy} />
            </div>
          </section>
        )
      )}
      {editing === "new" ? (
        <section className={styles.card}>
          <InlineEditor
            fields={fields}
            initial={{ title: "", description: "" }}
            busy={common.busy}
            onCancel={() => setEditing(null)}
            onSave={async v => {
              const saved = await onSave({ title: v.title.trim(), description: v.description.trim() }, null);
              if (saved) setEditing(null);
              return saved;
            }}
          />
        </section>
      ) : (
        <button type="button" className={styles.addButton} onClick={() => setEditing("new")} disabled={common.busy}>
          {P.pillars.add}
        </button>
      )}
    </StepFrame>
  );
}
