import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { buildDiffPreview, findMatches, replaceAll, replaceOne } from "../lib/findReplace";
import type { FindOptions } from "../types";

const INITIAL_FIND: FindOptions = {
  query: "",
  replacement: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  inSelection: false,
  preserveCase: false,
  scope: "document",
};

const FIND_HISTORY_KEY = "marcatoFindHistory";
const REPLACE_HISTORY_KEY = "marcatoReplaceHistory";

export function useFindReplace(
  text: string,
  editorRef: RefObject<HTMLTextAreaElement | null>,
  commitContent: (content: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<FindOptions>(INITIAL_FIND);
  const [activeMatch, setActiveMatch] = useState(0);
  const [findHistory, setFindHistory] = useState<string[]>(() => readHistory(FIND_HISTORY_KEY));
  const [replaceHistory, setReplaceHistory] = useState<string[]>(() => readHistory(REPLACE_HISTORY_KEY));
  const [replacePreview, setReplacePreview] = useState<ReturnType<typeof buildDiffPreview> | null>(null);
  const matches = useMemo(() => findMatches(text, options, getCurrentSelection(editorRef.current)), [editorRef, options, text]);

  useEffect(() => {
    if (activeMatch >= matches.length) setActiveMatch(Math.max(0, matches.length - 1));
  }, [activeMatch, matches.length]);

  const cycleMatch = useCallback((direction: 1 | -1) => {
    if (!matches.length) return;
    rememberHistory(FIND_HISTORY_KEY, options.query, setFindHistory);
    const next = (activeMatch + direction + matches.length) % matches.length;
    setActiveMatch(next);
    const match = matches[next];
    editorRef.current?.focus();
    editorRef.current?.setSelectionRange(match.start, match.end);
  }, [activeMatch, editorRef, matches]);

  const replaceCurrent = useCallback(() => {
    const match = matches[activeMatch];
    if (!match) return;
    rememberHistory(FIND_HISTORY_KEY, options.query, setFindHistory);
    rememberHistory(REPLACE_HISTORY_KEY, options.replacement, setReplaceHistory);
    commitContent(replaceOne(text, match, options));
  }, [activeMatch, commitContent, matches, options, text]);

  const replaceEveryMatch = useCallback(() => {
    if (!matches.length) return;
    rememberHistory(FIND_HISTORY_KEY, options.query, setFindHistory);
    rememberHistory(REPLACE_HISTORY_KEY, options.replacement, setReplaceHistory);
    setReplacePreview(buildDiffPreview(text, matches, options));
  }, [matches, options, text]);

  const confirmReplaceEveryMatch = useCallback(() => {
    if (!matches.length) {
      setReplacePreview(null);
      return;
    }
    commitContent(replaceAll(text, matches, options));
    setReplacePreview(null);
  }, [commitContent, matches, options, text]);

  return {
    activeMatch,
    cancelReplacePreview: () => setReplacePreview(null),
    confirmReplaceEveryMatch,
    cycleMatch,
    findHistory,
    matches,
    open,
    options,
    replaceHistory,
    replaceCurrent,
    replaceEveryMatch,
    replacePreview,
    setOpen,
    setOptions,
  };
}

function getCurrentSelection(editor: HTMLTextAreaElement | null) {
  if (!editor) return undefined;
  return { start: editor.selectionStart, end: editor.selectionEnd };
}

function readHistory(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function rememberHistory(key: string, value: string, setHistory: (items: string[]) => void) {
  const normalized = value.trim();
  if (!normalized) return;
  const next = [normalized, ...readHistory(key).filter((item) => item !== normalized)].slice(0, 12);
  localStorage.setItem(key, JSON.stringify(next));
  setHistory(next);
}
