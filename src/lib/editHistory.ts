export const MAX_HISTORY_ENTRIES = 80;
export const MAX_HISTORY_CHARACTERS = 640 * 1024;
export const EDIT_COALESCE_MS = 1_000;

export interface EditHistoryState {
  content: string;
  history: string[];
  historyIndex: number;
}

export interface EditHistoryBatch {
  group: "insert" | "delete";
  historyIndex: number;
  snapshot: string;
  updatedAt: number;
}

interface RecordEditOptions {
  batch?: EditHistoryBatch | null;
  inputType?: string;
  mode: "input" | "commit";
  now?: number;
}

export interface EditHistoryResult<T extends EditHistoryState> {
  batch: EditHistoryBatch | null;
  state: T;
}

/**
 * Records editor content while keeping the currently displayed content and the
 * selected history snapshot in sync. Text insertion/deletion is grouped for a
 * short window; explicit editor commands always create their own snapshot.
 */
export function recordEdit<T extends EditHistoryState>(
  source: T,
  content: string,
  options: RecordEditOptions,
): EditHistoryResult<T> {
  const state = reconcileHistory(source);
  if (content === state.content) return { state, batch: null };

  if (options.mode === "commit") {
    return { state: appendSnapshot(state, content), batch: null };
  }

  const now = options.now ?? Date.now();
  const group = inputGroup(options.inputType);
  const batch = options.batch;
  const batchEntryMatches = Boolean(batch && state.history[state.historyIndex] === batch.snapshot);
  const canCoalesce = Boolean(
    group &&
    batch &&
    batch.group === group &&
    batchEntryMatches &&
    state.historyIndex === state.history.length - 1 &&
    now - batch.updatedAt >= 0 &&
    now - batch.updatedAt <= EDIT_COALESCE_MS,
  );

  const nextState = canCoalesce
    ? replaceCurrentSnapshot(state, content)
    : appendSnapshot(state, content);

  return {
    state: nextState,
    batch: group
      ? { group, historyIndex: nextState.historyIndex, snapshot: nextState.content, updatedAt: now }
      : null,
  };
}

export function undoEdit<T extends EditHistoryState>(source: T): T {
  const state = reconcileHistory(source);
  if (state.historyIndex <= 0) return state;
  const historyIndex = state.historyIndex - 1;
  return { ...state, content: state.history[historyIndex], historyIndex };
}

export function redoEdit<T extends EditHistoryState>(source: T): T {
  const state = reconcileHistory(source);
  if (state.historyIndex >= state.history.length - 1) return state;
  const historyIndex = state.historyIndex + 1;
  return { ...state, content: state.history[historyIndex], historyIndex };
}

/**
 * Repairs legacy tabs whose live content was persisted before it was added to
 * history. This also makes an immediate undo after reloading such a tab work.
 */
export function reconcileHistory<T extends EditHistoryState>(source: T): T {
  const storedHistory = Array.isArray(source.history)
    ? source.history.filter((entry): entry is string => typeof entry === "string")
    : [];
  let history = storedHistory.length ? storedHistory : [source.content];
  let historyIndex = Number.isFinite(source.historyIndex)
    ? Math.min(Math.max(Math.trunc(source.historyIndex), 0), history.length - 1)
    : history.length - 1;

  if (history[historyIndex] !== source.content) {
    history = history.slice(0, historyIndex + 1);
    if (history[history.length - 1] !== source.content) history.push(source.content);
    historyIndex = history.length - 1;
  }

  const limited = limitHistory(history, historyIndex);
  history = limited.history;
  historyIndex = limited.historyIndex;

  const sourceHistory = Array.isArray(source.history) ? source.history : [];
  const historyUnchanged = sourceHistory.length === history.length &&
    sourceHistory.every((entry, index) => entry === history[index]);
  if (historyUnchanged && historyIndex === source.historyIndex) return source;
  return { ...source, history, historyIndex };
}

function appendSnapshot<T extends EditHistoryState>(state: T, content: string): T {
  const history = state.history.slice(0, state.historyIndex + 1);
  if (history[history.length - 1] !== content) history.push(content);
  const limited = limitHistory(history, history.length - 1);
  return { ...state, content, history: limited.history, historyIndex: limited.historyIndex };
}

function replaceCurrentSnapshot<T extends EditHistoryState>(state: T, content: string): T {
  const history = [...state.history];
  history[state.historyIndex] = content;
  const limited = limitHistory(history, state.historyIndex);
  return { ...state, content, history: limited.history, historyIndex: limited.historyIndex };
}

/**
 * Keeps a contiguous window around the selected snapshot. The current entry and
 * its nearest undo/redo entries are mandatory, even when those documents exceed
 * the soft character budget; all more distant entries must fit both limits.
 * Keeping both neighbors prevents an undo from trimming away its only redo
 * target while still bounding normal-sized history growth.
 */
function limitHistory(history: string[], historyIndex: number) {
  if (history.length === 0) return { history: [""], historyIndex: 0 };

  const selectedIndex = Math.min(Math.max(Math.trunc(historyIndex), 0), history.length - 1);
  let start = selectedIndex > 0 ? selectedIndex - 1 : selectedIndex;
  let end = Math.min(history.length - 1, selectedIndex + 1);
  let characters = history.slice(start, end + 1).reduce((total, entry) => total + entry.length, 0);

  while (start > 0 && end - start + 1 < MAX_HISTORY_ENTRIES) {
    const candidate = history[start - 1];
    if (characters + candidate.length > MAX_HISTORY_CHARACTERS) break;
    start -= 1;
    characters += candidate.length;
  }

  // Redo snapshots are only retained when every snapshot between the current
  // position and that candidate can fit; never skip an adjacent redo entry.
  while (end + 1 < history.length && end - start + 1 < MAX_HISTORY_ENTRIES) {
    const candidate = history[end + 1];
    if (characters + candidate.length > MAX_HISTORY_CHARACTERS) break;
    end += 1;
    characters += candidate.length;
  }

  return {
    history: history.slice(start, end + 1),
    historyIndex: selectedIndex - start,
  };
}

function inputGroup(inputType = "insertText"): EditHistoryBatch["group"] | null {
  if (inputType === "insertText" || inputType === "insertCompositionText") return "insert";
  if (inputType === "deleteContentBackward" || inputType === "deleteContentForward") return "delete";
  return null;
}
