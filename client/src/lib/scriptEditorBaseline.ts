export type ScriptEditorBaseline = {
  content: string;
  title: string;
  notes: string;
  postDateKey: string | null;
  postTime: string;
};

function postDateKeyFromValue(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function baselineFromScript(script: {
  content: string;
  title: string;
  notes?: string | null;
  postDate?: string | Date | null;
  postTime?: string | null;
}): ScriptEditorBaseline {
  return {
    content: script.content ?? "",
    title: script.title ?? "",
    notes: script.notes ?? "",
    postDateKey: postDateKeyFromValue(script.postDate),
    postTime: script.postTime || "09:00",
  };
}

export function baselineFromEditorState(args: {
  editedContent: string;
  editedTitle: string;
  editedNotes: string;
  postDate: Date | undefined;
  postTime: string;
}): ScriptEditorBaseline {
  return {
    content: args.editedContent,
    title: args.editedTitle,
    notes: args.editedNotes,
    postDateKey: args.postDate ? args.postDate.toISOString().slice(0, 10) : null,
    postTime: args.postTime || "09:00",
  };
}

export function isScriptEditorDirty(
  baseline: ScriptEditorBaseline | null,
  args: {
    editedContent: string;
    editedTitle: string;
    editedNotes: string;
    postDate: Date | undefined;
    postTime: string;
  }
): boolean {
  if (!baseline) return false;
  const current = baselineFromEditorState(args);
  return (
    current.content !== baseline.content ||
    current.title !== baseline.title ||
    current.notes !== baseline.notes ||
    current.postDateKey !== baseline.postDateKey ||
    current.postTime !== baseline.postTime
  );
}

export function isStatusOnlyScriptUpdate(variables: {
  status?: string;
  content?: string;
  title?: string;
  notes?: string | null;
}): boolean {
  return (
    variables.status !== undefined &&
    variables.content === undefined &&
    variables.title === undefined &&
    variables.notes === undefined
  );
}
