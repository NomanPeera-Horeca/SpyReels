/**
 * Step 4: Goal, Audience, Pillars. Approved Figma: Goal default 1676:428,
 * Goal edit 1676:468, Audience edit 1676:537, Pillars edit 1676:628 (review
 * board 1676:420). Presentational: values come from the server; nothing here
 * invents a value.
 *
 * Editing is shared. Every editor registers with StepFrame. Continue, Back and
 * the step tabs first save each open editor's valid change (or stop with the
 * draft kept). Skip is deliberate and does not save. An editor leaves edit
 * mode only after the server confirms the save.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
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
import {
  IconAiSparkle,
  IconClose,
  IconPencil,
  IconPillar,
  IconTrash,
} from "@/design-system/icons";
import { OnboardingShell } from "@/design-system/OnboardingShell";
import { PersonalizationStepper } from "@/design-system/PersonalizationStepper";
import { COPY } from "./copy";
import { decidePendingSave } from "./pendingEdits";
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
  onRetryAi?: () => void;
};

/* ---------- pending edits (shared by every editor in the step) ---------- */

export type PendingHandlers = {
  /** Save the valid pending change. Resolves false when it could not be saved (the draft is kept). */
  flush: () => Promise<boolean>;
  /** True while the editor holds text the user has not saved. */
  dirty: () => boolean;
};
type PendingRegistry = {
  register: (id: string, handlers: PendingHandlers) => () => void;
  /** Saves every open editor. Used by Continue, Back, step tabs and Done. */
  flushAll: () => Promise<boolean>;
};
const PendingEditsContext = createContext<PendingRegistry>({
  register: () => () => undefined,
  flushAll: async () => true,
});

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
  const handlers = useRef(new Map<string, PendingHandlers>());
  const running = useRef(false);
  const [flushing, setFlushing] = useState(false);

  const flushAll = useCallback(async () => {
    if (running.current) return false;
    running.current = true;
    setFlushing(true);
    try {
      for (const h of [...handlers.current.values()]) {
        if (!(await h.flush())) return false;
      }
      return true;
    } finally {
      running.current = false;
      setFlushing(false);
    }
  }, []);

  const registry = useMemo<PendingRegistry>(
    () => ({
      register: (id, h) => {
        handlers.current.set(id, h);
        return () => {
          handlers.current.delete(id);
        };
      },
      flushAll,
    }),
    [flushAll]
  );

  // Reload or tab close with unsaved text: the browser asks first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if ([...handlers.current.values()].some(h => h.dirty())) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const next = async () => {
    if (await flushAll()) common.onConfirm();
  };
  const back = async () => {
    if (await flushAll()) common.onBack();
  };
  const selectStep = async (s: PersonalizationStep) => {
    if (await flushAll()) common.onStepSelect(s);
  };

  const end = (
    <>
      <GhostButton onClick={common.onSkip} disabled={common.busy || flushing} className={styles.skip}>
        {P.skip}
      </GhostButton>
      <PrimaryButton
        onClick={() => void next()}
        disabled={common.busy || flushing || !canConfirm}
        aria-busy={common.busy || flushing}
        className={styles.main}
      >
        {mainLabel}
      </PrimaryButton>
    </>
  );
  return (
    <PendingEditsContext.Provider value={registry}>
      <OnboardingShell
        onBack={() => void back()}
        preview={common.preview}
        contentWidth="wide"
        actions={
          <div className={styles.actionsRow}>
            <GhostButton onClick={() => void back()} disabled={flushing} leadingIcon={<ChevronLeft />}>
              {COPY.back}
            </GhostButton>
            <div className={styles.actionsEnd}>{end}</div>
          </div>
        }
        mobileActions={end}
        testId={`onboarding-step-${step}`}
      >
        <PersonalizationStepper current={step} onSelect={s => void selectStep(s)} />
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
              {P.failed}{" "}
              {common.onRetryAi ? (
                <button type="button" className={styles.retry} onClick={common.onRetryAi}>
                  {P.retry}
                </button>
              ) : null}
            </p>
          ) : null}
          {children}
        </div>
      </OnboardingShell>
    </PendingEditsContext.Provider>
  );
}

/* ---------- shared actions ---------- */

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

/** Red trash, 20px icon in a 44px tap target (Figma 1437:4522 / 1437:4524). */
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

/* ---------- inline chip group (Goals 1676:428 / 1676:468, Audience 1676:537) ---------- */

type ChipItem = { id: string; label: string };
const NEW = "__new__";
const hasText = (v: string | undefined) => (v ?? "").trim() !== "";

/**
 * Grey chips. Default: read-only chips with one quiet Edit and an Add. Edit mode:
 * every chip's text is editable in place, red trash sits beside each chip,
 * Add opens an empty chip, and one small Cancel / Save covers the group.
 * Trash removes at once (the step offers Undo). Save and Continue save the
 * drafts; Cancel is the only thing that discards them.
 */
function ChipGroup({
  groupLabel,
  items,
  addLabel,
  fieldLabel,
  placeholder,
  maxLength,
  max,
  min = 0,
  busy,
  autoOpenAdd = false,
  onSaveDraft,
  onRemove,
}: {
  groupLabel: string;
  items: ChipItem[];
  addLabel: string;
  fieldLabel: string;
  placeholder?: string;
  maxLength: number;
  max?: number;
  min?: number;
  busy: boolean;
  /** Open an empty chip straight away (no value yet and the AI asked or failed). */
  autoOpenAdd?: boolean;
  /** Resolves true only after the server confirmed. itemId null = new value. */
  onSaveDraft: (text: string, itemId: string | null) => Promise<boolean>;
  onRemove: (itemId: string) => void;
}) {
  const pending = useContext(PendingEditsContext);
  const groupId = useId();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const canAdd = max === undefined || items.length < max;
  const canRemove = items.length > min;

  // Latest values for the registry handlers (they are called later, from Continue).
  const latest = useRef({ items, drafts, onSaveDraft, busy });
  latest.current = { items, drafts, onSaveDraft, busy };

  const setDraft = (key: string, value: string | null) =>
    setDrafts(d => {
      const next = { ...d };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });

  const startAdd = () => {
    setMode("edit");
    setDrafts(d => ({ ...d, [NEW]: d[NEW] ?? "" }));
  };
  const cancel = () => {
    setDrafts({});
    setMode("view");
  };

  // Saves every changed draft in order. Stops at the first failure (kept for retry).
  const saveAll = async (): Promise<boolean> => {
    const cur = latest.current;
    for (const item of cur.items) {
      if (item.id in cur.drafts && !hasText(cur.drafts[item.id])) {
        toast.error(P.finishEdit);
        return false;
      }
    }
    for (const item of cur.items) {
      const draft = cur.drafts[item.id];
      if (draft === undefined) continue;
      const text = draft.trim();
      if (text !== item.label.trim()) {
        const ok = await cur.onSaveDraft(text, item.id);
        if (!ok) return false;
      }
      setDraft(item.id, null);
    }
    const added = cur.drafts[NEW];
    if (added !== undefined) {
      if (hasText(added)) {
        const ok = await cur.onSaveDraft(added.trim(), null);
        if (!ok) return false;
      }
      setDraft(NEW, null);
    }
    setMode("view");
    return true;
  };

  // Continue, Back and step tabs call this through the step. Drafts stay if it fails.
  useEffect(
    () =>
      pending.register(groupId, {
        flush: async () => {
          if (latest.current.busy) return false;
          return saveAll();
        },
        dirty: () => Object.values(latest.current.drafts).some(hasText),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, groupId]
  );

  // The AI asked or failed with nothing saved: start with an empty chip.
  useEffect(() => {
    if (autoOpenAdd && items.length === 0) startAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd]);

  const submit = async () => {
    if (busy) return;
    await saveAll();
  };

  if (mode === "edit") {
    return (
      <section className={[styles.card, styles.group].join(" ")} aria-label={groupLabel}>
        <form
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <ul className={styles.chipEditList}>
            {items.map(item => (
              <li key={item.id} className={styles.chipEditRow}>
                <label className={styles.chipField}>
                  <input
                    className={styles.chipInput}
                    aria-label={`${fieldLabel}: ${item.label}`}
                    value={drafts[item.id] ?? item.label}
                    maxLength={maxLength}
                    disabled={busy}
                    onChange={e => setDraft(item.id, e.target.value)}
                  />
                </label>
                {canRemove ? (
                  <TrashAction onClick={() => onRemove(item.id)} label={item.label} disabled={busy} />
                ) : null}
              </li>
            ))}
            {NEW in drafts ? (
              <li className={styles.chipEditRow}>
                <label className={styles.chipField}>
                  <input
                    className={styles.chipInput}
                    aria-label={fieldLabel}
                    placeholder={placeholder}
                    value={drafts[NEW]}
                    maxLength={maxLength}
                    disabled={busy}
                    autoFocus
                    onChange={e => setDraft(NEW, e.target.value)}
                  />
                </label>
                <span className={styles.chipSpacer} aria-hidden />
              </li>
            ) : null}
          </ul>
          <div className={[styles.groupActions, styles.groupActionsEdit].join(" ")}>
            {canAdd && !(NEW in drafts) ? (
              <button type="button" className={styles.addChip} onClick={startAdd} disabled={busy}>
                {addLabel}
              </button>
            ) : (
              <span />
            )}
            <div className={styles.editActions}>
              <GhostButton type="button" onClick={cancel} disabled={busy}>
                {P.cancel}
              </GhostButton>
              <PrimaryButton type="submit" disabled={busy} className={styles.smallSave}>
                {P.save}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className={[styles.card, styles.group].join(" ")} aria-label={groupLabel}>
      {items.length ? (
        <ul className={styles.chips}>
          {items.map(item => (
            <li key={item.id} className={styles.chip} data-suggestion-visible="">
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className={["sr-text-product-body-small", styles.muted].join(" ")}>{P.notSet}</p>
      )}
      <div className={styles.groupActions}>
        {canAdd ? (
          <button type="button" className={styles.addChip} onClick={startAdd} disabled={busy}>
            {addLabel}
          </button>
        ) : (
          <span />
        )}
        {items.length ? <EditAction onClick={() => setMode("edit")} label={groupLabel} disabled={busy} /> : null}
      </div>
    </section>
  );
}

/* ---------- labelled value with Edit (Niche, Language) ---------- */

/** Single-line inline editor used by Niche and Language. Registers with the step like the chips do. */
function ValueEditor({
  label,
  max,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  label: string;
  max: number;
  initial: string;
  busy: boolean;
  onSave: (value: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const pending = useContext(PendingEditsContext);
  const id = useId();
  const [value, setValue] = useState(initial);
  const latest = useRef({ value, initial, onSave, busy });
  latest.current = { value, initial, onSave, busy };
  useEffect(
    () =>
      pending.register(id, {
        flush: async () => {
          const cur = latest.current;
          const d = decidePendingSave([{ key: "v", required: true }], { v: cur.initial }, { v: cur.value });
          if (d === "skip") return true;
          if (d === "block") {
            toast.error(P.finishEdit);
            return false;
          }
          return cur.onSave(cur.value.trim());
        },
        dirty: () => latest.current.value.trim() !== latest.current.initial.trim(),
      }),
    [pending, id]
  );
  return (
    <form
      className={styles.editor}
      onSubmit={e => {
        e.preventDefault();
        if (value.trim() && !busy) void onSave(value.trim());
      }}
    >
      <FieldInput id={`${id}-field`} label={label} value={value} maxLength={max} autoFocus onChange={e => setValue(e.target.value)} />
      <div className={styles.editorActions}>
        <GhostButton type="button" onClick={onCancel} disabled={busy}>
          {P.cancel}
        </GhostButton>
        <PrimaryButton type="submit" disabled={busy || !value.trim()}>
          {P.save}
        </PrimaryButton>
      </div>
    </form>
  );
}

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
        <ValueEditor label={label} max={max} initial={value ?? ""} busy={busy} onCancel={onCancel} onSave={onSave} />
      ) : (
        <div className={styles.row}>
          <div className={styles.text}>
            <span className={["sr-text-product-caption", styles.caption].join(" ")}>{label}</span>
            <span
              className={["sr-text-product-card-title", styles.value].join(" ")}
              {...(value ? { "data-suggestion-visible": "" } : {})}
            >
              {value ?? P.notSet}
            </span>
          </div>
          <EditAction onClick={onEdit} label={label} disabled={busy} />
        </div>
      )}
    </section>
  );
}

/* ---------- 4a Goal (1676:428 / 1676:468) ---------- */

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
        items={goals.map(g => ({ id: g.id, label: g.payload.text }))}
        addLabel={P.goal.add}
        fieldLabel={clarify ?? P.goal.fieldLabel}
        placeholder={P.goal.placeholder}
        maxLength={300}
        max={MAX_GOALS}
        min={1}
        busy={common.busy}
        autoOpenAdd={clarify !== null || common.ai.state === "failed"}
        onSaveDraft={(text, id) => onSaveGoal({ text }, id)}
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

/* ---------- 4b Audience (1676:537) ---------- */

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
        items={audiences.map(a => ({ id: a.id, label: a.payload.who }))}
        addLabel={P.audience.add}
        fieldLabel={P.audience.whoLabel}
        maxLength={120}
        busy={common.busy}
        autoOpenAdd={common.ai.state === "failed" || common.ai.state === "clarify"}
        onSaveDraft={(text, id) => {
          // One visible field. The stored outcome is kept as it was, never discarded.
          const existing = id ? audiences.find(a => a.id === id)?.payload : undefined;
          return onSave({ who: text, outcome: existing?.outcome ?? "" }, id);
        }}
        onRemove={onRemove}
      />
    </StepFrame>
  );
}

/* ---------- 4c Pillars (1676:628) ---------- */

type PillarItem = StepItem<PillarPayload>;

/** A subtopic row from getState.pillarSubtopics (Cursor's table). Dismissed rows are never shown. */
export type PillarSubtopicView = {
  id: string;
  pillarItemId: string;
  label: string;
  status: "suggested" | "confirmed" | "dismissed";
};

const visibleFor = (all: PillarSubtopicView[], pillarItemId: string) =>
  all
    .filter(s => s.pillarItemId === pillarItemId && s.status !== "dismissed")
    .map(s => ({ id: s.id, text: s.label }));

/** One pillar card. Title only is editable; description and subtopics are kept as stored. */
function PillarCard({
  pillar,
  subtopics,
  busy,
  inEdit,
  onStartEdit,
  onRemove,
  onRemoveSubtopic,
  topicState,
  onRequestTopics,
}: {
  pillar: PillarItem;
  subtopics: { id: string; text: string }[];
  busy: boolean;
  inEdit: boolean;
  onStartEdit: () => void;
  onRemove: () => void;
  onRemoveSubtopic: (subtopicId: string) => void;
  topicState: string | undefined;
  onRequestTopics: () => void;
}) {
  return (
    <div className={styles.pillarGroup}>
      <section className={[styles.card, styles.pillarCard].join(" ")}>
        <span className={styles.pillarTile}>
          <IconPillar size={24} />
        </span>
        <div className={styles.pillarText}>
          {inEdit ? (
            <button type="button" className={styles.pillarTitleButton} onClick={onStartEdit} disabled={busy}>
              <span className={["sr-text-product-card-title", styles.value].join(" ")} data-suggestion-visible="">
                {pillar.payload.title}
              </span>
            </button>
          ) : (
            <span className={["sr-text-product-card-title", styles.value].join(" ")} data-suggestion-visible="">
              {pillar.payload.title}
            </span>
          )}
          {pillar.payload.description ? (
            <span className={["sr-text-product-body-small", styles.muted, styles.clamp2].join(" ")}>
              {pillar.payload.description}
            </span>
          ) : null}
        </div>
        {inEdit ? (
          <div className={styles.pillarActions}>
            <TrashAction onClick={onRemove} label={pillar.payload.title} disabled={busy} />
          </div>
        ) : null}
      </section>
      <SubtopicChips subtopics={subtopics} busy={busy} onRemove={onRemoveSubtopic} label={pillar.payload.title} />
      <TopicIdeasAction state={topicState} busy={busy} onRequest={onRequestTopics} />
    </div>
  );
}

const TOPIC_NOTE: Record<string, string> = {
  generating: "Finding topic ideas…",
  all_dismissed: "All topic ideas removed.",
  no_topics: "No topic ideas came back for this pillar.",
  failed: "Topic ideas didn't load.",
  exhausted: "Topic ideas couldn't load. Try again later.",
};

/**
 * Topic ideas are requested by the user only. The button is the one place that
 * starts a model call; nothing else on the page does.
 */
function TopicIdeasAction({
  state,
  busy,
  onRequest,
}: {
  state: string | undefined;
  busy: boolean;
  onRequest: () => void;
}) {
  if (!state || state === "ready") return null;
  const canAsk = state === "never_generated" || state === "failed";
  const note = TOPIC_NOTE[state];
  if (!note && !canAsk) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {note ? <span className={["sr-text-product-body-small", styles.muted].join(" ")}>{note}</span> : null}
      {canAsk ? (
        <GhostButton type="button" onClick={onRequest} disabled={busy}>
          {state === "failed" ? "Try again" : "Find topic ideas"}
        </GhostButton>
      ) : null}
    </div>
  );
}

/** AI subtopics: always visible grey chips with the sparkle. The X shows on hover or focus, or after a tap. */
function SubtopicChips({
  subtopics,
  busy,
  onRemove,
  label,
}: {
  subtopics: { id: string; text: string }[];
  busy: boolean;
  onRemove: (subtopicId: string) => void;
  label: string;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  if (!subtopics.length) return null;
  return (
    <ul className={styles.subtopics} aria-label={`${P.subtopicsLabel}: ${label}`}>
      {subtopics.map(s => (
        <li key={s.id} className={styles.subtopic} data-revealed={revealed === s.id ? "true" : "false"}>
          <span className={styles.subtopicText} onClick={() => setRevealed(r => (r === s.id ? null : s.id))}>
            <IconAiSparkle size={12} />
            <span>{s.text}</span>
          </span>
          <button
            type="button"
            className={styles.subtopicX}
            onClick={() => onRemove(s.id)}
            disabled={busy}
            aria-label={`${P.remove} ${s.text}`}
          >
            <IconClose size={10} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The inline title editor that replaces a card while its title is being edited. */
function PillarTitleEditor({
  pillar,
  subtopics,
  busy,
  onSave,
  onCancel,
  onRemove,
  onRemoveSubtopic,
}: {
  /** null = a new pillar. */
  pillar: PillarItem | null;
  subtopics: { id: string; text: string }[];
  busy: boolean;
  onSave: (title: string, description: string, itemId: string | null) => Promise<boolean>;
  onCancel: () => void;
  onRemove?: () => void;
  onRemoveSubtopic: (subtopicId: string) => void;
}) {
  const pending = useContext(PendingEditsContext);
  const id = useId();
  const initial = pillar?.payload.title ?? "";
  const [title, setTitle] = useState(initial);
  const latest = useRef({ title, initial, pillar, onSave, busy });
  latest.current = { title, initial, pillar, onSave, busy };

  useEffect(
    () =>
      pending.register(id, {
        flush: async () => {
          const cur = latest.current;
          const d = decidePendingSave([{ key: "title", required: true }], { title: cur.initial }, { title: cur.title });
          if (d === "skip") return true;
          if (d === "block") {
            toast.error(P.finishEdit);
            return false;
          }
          return cur.onSave(cur.title.trim(), cur.pillar?.payload.description ?? "", cur.pillar?.id ?? null);
        },
        dirty: () => latest.current.title.trim() !== latest.current.initial.trim(),
      }),
    [pending, id]
  );

  return (
    <section className={styles.card}>
      <form
        className={styles.editor}
        onSubmit={async e => {
          e.preventDefault();
          if (!title.trim() || busy) return;
          await onSave(title.trim(), pillar?.payload.description ?? "", pillar?.id ?? null);
        }}
      >
        <div className={styles.pillarEditHeader}>
          <span className={["sr-text-product-caption", styles.caption].join(" ")}>{P.pillars.titleLabel}</span>
          {onRemove ? <TrashAction onClick={onRemove} label={initial} disabled={busy} /> : null}
        </div>
        <FieldInput
          id={`${id}-title`}
          label={P.pillars.titleLabel}
          value={title}
          maxLength={80}
          autoFocus
          onChange={e => setTitle(e.target.value)}
        />
        {subtopics.length ? (
          <SubtopicChips subtopics={subtopics} busy={busy} onRemove={onRemoveSubtopic} label={initial} />
        ) : null}
        <div className={styles.editorActions}>
          <GhostButton type="button" onClick={onCancel} disabled={busy}>
            {P.cancel}
          </GhostButton>
          <PrimaryButton type="submit" disabled={busy || !title.trim()}>
            {P.save}
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}

export function PillarsStep(props: {
  common: Common;
  pillars: PillarItem[];
  /** getState.pillarSubtopics: canonical subtopic rows, dismissed included. */
  subtopics: PillarSubtopicView[];
  /** Title and description only; the server keeps subtopics. itemId null = new pillar. */
  onSave: (payload: { title: string; description: string }, itemId: string | null) => Promise<boolean>;
  onRemove: (itemId: string) => void;
  onRemoveSubtopic: (subtopicId: string) => void;
  /** getState.pillarTopics: topic-idea state per pillar item. */
  topics: Record<string, { state: string; attempts: number }>;
  /** The user asks for topic ideas for one pillar. The only generation path. */
  onRequestTopics: (pillarItemId: string) => void;
  /** False when getState.subtopicStore is not ready. Pillars still show; topic actions do not. */
  topicStoreReady: boolean;
}) {
  // The body must sit inside StepFrame so that it reads the step's pending-edit registry.
  return (
    <StepFrame
      step="pillars"
      title={P.pillars.title}
      subtitle={P.pillars.subtitle}
      mainLabel={P.pillars.main}
      common={props.common}
      canConfirm
    >
      <PillarsBody {...props} />
    </StepFrame>
  );
}

function PillarsBody({
  common,
  pillars,
  subtopics,
  onSave,
  onRemove,
  onRemoveSubtopic,
  topics,
  onRequestTopics,
  topicStoreReady,
}: {
  common: Common;
  pillars: PillarItem[];
  subtopics: PillarSubtopicView[];
  onSave: (payload: { title: string; description: string }, itemId: string | null) => Promise<boolean>;
  onRemove: (itemId: string) => void;
  onRemoveSubtopic: (subtopicId: string) => void;
  topics: Record<string, { state: string; attempts: number }>;
  onRequestTopics: (pillarItemId: string) => void;
  topicStoreReady: boolean;
}) {
  const pending = useContext(PendingEditsContext);
  const [mode, setMode] = useState<"view" | "edit">("view");
  /** The pillar whose title is open (id), or "new", or null. */
  const [editing, setEditing] = useState<string | "new" | null>(null);

  // Done saves an open title first; if that fails, the editor stays open with the text.
  const finishDone = async () => {
    if (await pending.flushAll()) {
      setEditing(null);
      setMode("view");
    }
  };

  return (
    <>
      {!topicStoreReady && pillars.length > 0 ? (
        <p className={["sr-text-product-body-small", styles.muted].join(" ")} role="status">
          Your pillars are saved. Topic ideas can't be shown right now, and nothing you saved has been lost.
        </p>
      ) : null}
      {pillars.map(p =>
        editing === p.id ? (
          <div key={p.id} className={styles.pillarGroup}>
            <PillarTitleEditor
              pillar={p}
              subtopics={visibleFor(subtopics, p.id)}
              busy={common.busy}
              onRemove={() => onRemove(p.id)}
              onRemoveSubtopic={onRemoveSubtopic}
              onCancel={() => setEditing(null)}
              onSave={async (title, description, id) => {
                const saved = await onSave({ title, description }, id);
                if (saved) setEditing(null);
                return saved;
              }}
            />
          </div>
        ) : (
          <PillarCard
            key={p.id}
            pillar={p}
            subtopics={visibleFor(subtopics, p.id)}
            busy={common.busy}
            inEdit={mode === "edit"}
            onStartEdit={() => setEditing(p.id)}
            onRemove={() => onRemove(p.id)}
            onRemoveSubtopic={onRemoveSubtopic}
            topicState={topics[p.id]?.state}
            onRequestTopics={() => onRequestTopics(p.id)}
          />
        )
      )}
      {editing === "new" ? (
        <PillarTitleEditor
          pillar={null}
          subtopics={[]}
          busy={common.busy}
          onRemoveSubtopic={() => undefined}
          onCancel={() => setEditing(null)}
          onSave={async (title, description, id) => {
            const saved = await onSave({ title, description }, id);
            if (saved) setEditing(null);
            return saved;
          }}
        />
      ) : null}
      <div className={styles.groupActions}>
        {editing === "new" ? (
          <span />
        ) : (
          <button
            type="button"
            className={styles.addChip}
            onClick={() => {
              setMode("edit");
              setEditing("new");
            }}
            disabled={common.busy}
          >
            {P.pillars.add}
          </button>
        )}
        {pillars.length ? (
          mode === "edit" ? (
            <GhostButton type="button" onClick={() => void finishDone()} disabled={common.busy}>
              {P.done}
            </GhostButton>
          ) : (
            <EditAction onClick={() => setMode("edit")} label={P.pillars.title} disabled={common.busy} />
          )
        ) : null}
      </div>
    </>
  );
}
