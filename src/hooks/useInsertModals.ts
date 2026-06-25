import { useState, type RefObject } from "react";
import {
  buildMarkdownAlert,
  buildMarkdownImage,
  buildMarkdownLink,
  buildMarkdownReference,
  buildMarkdownTable,
  insertText,
  suggestMarkdownReferenceNumber,
  type MarkdownAlertType,
  type TableAlignment,
} from "../lib/editorCommands";
import type { MarkdownTab } from "../types";

interface UseInsertModalsOptions {
  activeTab: MarkdownTab | undefined;
  commitContent: (content: string) => void;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  text: string;
}

interface TextSelection {
  end: number;
  start: number;
}

interface LabeledSelection extends TextSelection {
  text: string;
}

interface ReferenceSelection extends TextSelection {
  number: number;
}

export interface InsertModalHostProps {
  alertSelection: TextSelection | null;
  closeAlert: () => void;
  closeEmoji: () => void;
  closeImage: () => void;
  closeLink: () => void;
  closeReference: () => void;
  closeSymbols: () => void;
  closeTable: () => void;
  emojiSelection: TextSelection | null;
  imageSelection: LabeledSelection | null;
  insertAlert: (type: MarkdownAlertType) => void;
  insertEmojis: (shortcodes: string[]) => void;
  insertImage: (options: { alt: string; source: string }) => void;
  insertLink: (options: { text: string; url: string }) => void;
  insertReference: (options: { numberText: string; title: string; url: string }) => void;
  insertSymbols: (entities: string[]) => void;
  insertTable: (options: { alignment: TableAlignment; columns: number; rows: number }) => void;
  linkSelection: LabeledSelection | null;
  referenceSelection: ReferenceSelection | null;
  symbolsSelection: TextSelection | null;
  tableOpen: boolean;
}

export function useInsertModals({ activeTab, commitContent, editorRef, text }: UseInsertModalsOptions) {
  const [tableOpen, setTableOpen] = useState(false);
  const [linkSelection, setLinkSelection] = useState<LabeledSelection | null>(null);
  const [imageSelection, setImageSelection] = useState<LabeledSelection | null>(null);
  const [referenceSelection, setReferenceSelection] = useState<ReferenceSelection | null>(null);
  const [symbolsSelection, setSymbolsSelection] = useState<TextSelection | null>(null);
  const [alertSelection, setAlertSelection] = useState<TextSelection | null>(null);
  const [emojiSelection, setEmojiSelection] = useState<TextSelection | null>(null);

  const openTableModal = () => setTableOpen(true);

  const insertTable = (options: { alignment: TableAlignment; columns: number; rows: number }) => {
    const editor = editorRef.current;
    if (!editor || !activeTab) return;
    const table = buildMarkdownTable(options.columns, options.rows, options.alignment);
    const result = insertText(activeTab.content, editor.selectionStart, table);
    commitContent(result.value);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(result.start, result.end);
    });
  };

  const openLinkModal = () => {
    const editor = editorRef.current;
    if (!editor) {
      setLinkSelection({ start: 0, end: 0, text: "" });
      return;
    }
    setLinkSelection({
      start: editor.selectionStart,
      end: editor.selectionEnd,
      text: text.slice(editor.selectionStart, editor.selectionEnd),
    });
  };

  const insertLink = (options: { text: string; url: string }) => {
    if (!activeTab || !linkSelection) return;
    const markdown = buildMarkdownLink(options.text, options.url);
    const next = activeTab.content.slice(0, linkSelection.start) + markdown + activeTab.content.slice(linkSelection.end);
    commitContent(next);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const labelStart = linkSelection.start + 1;
      editor.focus();
      editor.setSelectionRange(labelStart, labelStart + (options.text.trim() || "link text").length);
    });
  };

  const openImageModal = () => {
    const editor = editorRef.current;
    if (!editor) {
      setImageSelection({ start: 0, end: 0, text: "" });
      return;
    }
    setImageSelection({
      start: editor.selectionStart,
      end: editor.selectionEnd,
      text: text.slice(editor.selectionStart, editor.selectionEnd),
    });
  };

  const insertImage = (options: { alt: string; source: string }) => {
    if (!activeTab || !imageSelection) return;
    const markdown = buildMarkdownImage(options.alt, options.source);
    const next = activeTab.content.slice(0, imageSelection.start) + markdown + activeTab.content.slice(imageSelection.end);
    commitContent(next);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const altStart = imageSelection.start + 2;
      editor.focus();
      editor.setSelectionRange(altStart, altStart + (options.alt.trim() || "image alt").length);
    });
  };

  const openReferenceModal = () => {
    const editor = editorRef.current;
    if (!editor) {
      setReferenceSelection({ start: 0, end: 0, number: suggestMarkdownReferenceNumber(text) });
      return;
    }
    setReferenceSelection({
      start: editor.selectionStart,
      end: editor.selectionEnd,
      number: suggestMarkdownReferenceNumber(text),
    });
  };

  const insertReference = (options: { numberText: string; title: string; url: string }) => {
    if (!activeTab || !referenceSelection) return;
    const result = buildMarkdownReference(activeTab.content, referenceSelection.start, referenceSelection.end, options.numberText, options.url, options.title);
    commitContent(result.value);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(result.start, result.end);
    });
  };

  const openSymbolsModal = () => {
    const editor = editorRef.current;
    if (!editor) {
      setSymbolsSelection({ start: 0, end: 0 });
      return;
    }
    setSymbolsSelection({ start: editor.selectionStart, end: editor.selectionEnd });
  };

  const insertSymbols = (entities: string[]) => {
    if (!activeTab || !symbolsSelection || entities.length === 0) return;
    const insertion = entities.join(" ");
    const next = activeTab.content.slice(0, symbolsSelection.start) + insertion + activeTab.content.slice(symbolsSelection.end);
    commitContent(next);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const caret = symbolsSelection.start + insertion.length;
      editor.focus();
      editor.setSelectionRange(caret, caret);
    });
  };

  const openAlertModal = () => {
    const editor = editorRef.current;
    if (!editor) {
      setAlertSelection({ start: 0, end: 0 });
      return;
    }
    setAlertSelection({ start: editor.selectionStart, end: editor.selectionEnd });
  };

  const insertAlert = (type: MarkdownAlertType) => {
    if (!activeTab || !alertSelection) return;
    const result = buildMarkdownAlert(activeTab.content, alertSelection.start, alertSelection.end, type);
    commitContent(result.value);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(result.start, result.end);
    });
  };

  const openEmojiModal = () => {
    const editor = editorRef.current;
    if (!editor) {
      setEmojiSelection({ start: 0, end: 0 });
      return;
    }
    setEmojiSelection({ start: editor.selectionStart, end: editor.selectionEnd });
  };

  const insertEmojis = (shortcodes: string[]) => {
    if (!activeTab || !emojiSelection || shortcodes.length === 0) return;
    const insertion = shortcodes.join(" ");
    const next = activeTab.content.slice(0, emojiSelection.start) + insertion + activeTab.content.slice(emojiSelection.end);
    commitContent(next);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const caret = emojiSelection.start + insertion.length;
      editor.focus();
      editor.setSelectionRange(caret, caret);
    });
  };

  return {
    hostProps: {
      alertSelection,
      closeAlert: () => setAlertSelection(null),
      closeEmoji: () => setEmojiSelection(null),
      closeImage: () => setImageSelection(null),
      closeLink: () => setLinkSelection(null),
      closeReference: () => setReferenceSelection(null),
      closeSymbols: () => setSymbolsSelection(null),
      closeTable: () => setTableOpen(false),
      emojiSelection,
      imageSelection,
      insertAlert,
      insertEmojis,
      insertImage,
      insertLink,
      insertReference,
      insertSymbols,
      insertTable,
      linkSelection,
      referenceSelection,
      symbolsSelection,
      tableOpen,
    },
    openAlertModal,
    openEmojiModal,
    openImageModal,
    openLinkModal,
    openReferenceModal,
    openSymbolsModal,
    openTableModal,
  };
}
