import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
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

export function useFindReplace(
  text: string,
  editorRef: RefObject<HTMLTextAreaElement | null>,
  commitContent: (content: string) => void,
) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<FindOptions>(INITIAL_FIND);
  const [activeMatch, setActiveMatch] = useState(0);
  const matches = useMemo(() => findMatches(text, options, getCurrentSelection(editorRef.current)), [editorRef, options, text]);

  useEffect(() => {
    if (activeMatch >= matches.length) setActiveMatch(Math.max(0, matches.length - 1));
  }, [activeMatch, matches.length]);

  const cycleMatch = useCallback((direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (activeMatch + direction + matches.length) % matches.length;
    setActiveMatch(next);
    const match = matches[next];
    editorRef.current?.focus();
    editorRef.current?.setSelectionRange(match.start, match.end);
  }, [activeMatch, editorRef, matches]);

  const replaceCurrent = useCallback(() => {
    const match = matches[activeMatch];
    if (!match) return;
    commitContent(replaceOne(text, match, options));
  }, [activeMatch, commitContent, matches, options, text]);

  const replaceEveryMatch = useCallback(() => {
    if (!matches.length) return;
    const preview = buildDiffPreview(text, matches, options);
    if (window.confirm(`${t("confirm.replaceMatches", { count: matches.length })}\n\n${preview}`)) {
      commitContent(replaceAll(text, matches, options));
    }
  }, [commitContent, matches, options, t, text]);

  return {
    activeMatch,
    cycleMatch,
    matches,
    open,
    options,
    replaceCurrent,
    replaceEveryMatch,
    setOpen,
    setOptions,
  };
}

function getCurrentSelection(editor: HTMLTextAreaElement | null) {
  if (!editor) return undefined;
  return { start: editor.selectionStart, end: editor.selectionEnd };
}
