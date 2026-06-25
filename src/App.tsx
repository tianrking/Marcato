import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ALargeSmall,
  BadgeAlert,
  BadgeCent,
  BookMarked,
  Bold,
  Braces,
  CalendarClock,
  CaseLower,
  CaseUpper,
  Code2,
  Eye,
  FilePlus2,
  Heading4,
  Heading5,
  Heading6,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Play,
  Redo2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sigma,
  Smile,
  Strikethrough,
  Table2,
  Maximize2,
  Minus,
  Terminal,
  Trash2,
  TextQuote,
  Undo2,
} from "lucide-react";
import { AppHeader } from "./components/AppHeader";
import { ConfirmModal } from "./components/ConfirmModal";
import { FindReplacePanel } from "./components/FindReplacePanel";
import { IconButton } from "./components/Common";
import { GitHubImportModal } from "./components/GitHubImportModal";
import { InsertModalHost } from "./components/InsertModalHost";
import { MobileMenu } from "./components/MobileMenu";
import { PreviewPane } from "./components/PreviewPane";
import { ShareModal } from "./components/ShareModal";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import { useFindReplace } from "./hooks/useFindReplace";
import { useGitHubImport } from "./hooks/useGitHubImport";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useInsertModals } from "./hooks/useInsertModals";
import { useMarkdownRender } from "./hooks/useMarkdownRender";
import { useShare } from "./hooks/useShare";
import { MAX_IMPORT_BYTES, MAX_TABS } from "./lib/constants";
import { applyCommand, handleSmartEnter, type MarkdownCommand } from "./lib/editorCommands";
import { getExportName } from "./lib/exportNames";
import { analyzeDocumentHealth } from "./lib/documentHealth";
import { i18n } from "./lib/i18n";
import { previewDocumentToHtml, type PreviewBlock } from "./lib/previewDocument";
import { makeTab } from "./lib/storage";
import { useAppStore } from "./stores/appStore";
import type { PdfExportPhase } from "./lib/exporters";
import type { MarkdownTab } from "./types";

interface PdfExportState {
  phase: PdfExportPhase | "cancelling";
  progress: number;
}

interface ConfirmAction {
  confirmLabel: string;
  danger?: boolean;
  message: string;
  onConfirm: () => void;
  title: string;
}

const PDF_EXPORT_LABEL_KEYS: Record<PdfExportState["phase"], string> = {
  preparing: "export.pdfPreparing",
  rendering: "export.pdfRendering",
  paginating: "export.pdfPaginating",
  saving: "export.pdfSaving",
  cancelling: "export.pdfCancelling",
};

function App() {
  const { t } = useTranslation();
  const globalState = useAppStore((state) => state.globalState);
  const tabs = useAppStore((state) => state.tabs);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const untitledCounter = useAppStore((state) => state.untitledCounter);
  const initializeWorkspace = useAppStore((state) => state.initializeWorkspace);
  const updateGlobal = useAppStore((state) => state.updateGlobal);
  const setActiveTabId = useAppStore((state) => state.setActiveTabId);
  const updateActiveContent = useAppStore((state) => state.updateActiveContent);
  const addTab = useAppStore((state) => state.addTab);
  const addTabs = useAppStore((state) => state.addTabs);
  const closeStoreTab = useAppStore((state) => state.closeTab);
  const renameStoreTab = useAppStore((state) => state.renameTab);
  const duplicateStoreTab = useAppStore((state) => state.duplicateTab);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const [selectedPreviewBlockId, setSelectedPreviewBlockId] = useState("");
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pdfExport, setPdfExport] = useState<PdfExportState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfAbortRef = useRef<AbortController | null>(null);
  const syncingRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  );
  const { document: previewDocument, toc, state: renderState, error: renderError } = useMarkdownRender(activeTab);
  const text = activeTab?.content || "";
  const commitContent = useCallback((content: string) => updateActiveContent(content, true), [updateActiveContent]);
  const findReplace = useFindReplace(text, editorRef, commitContent);
  const insertModals = useInsertModals({ activeTab, commitContent, editorRef, text });
  const share = useShare(text, showToast);
  const stats = useMemo(() => getStats(text), [text]);
  const health = useMemo(() => analyzeDocumentHealth(text), [text]);
  const renderedHtml = useMemo(() => previewDocumentToHtml(previewDocument), [previewDocument]);
  const liveMessage = toast ||
    (pdfExport ? `${t(PDF_EXPORT_LABEL_KEYS[pdfExport.phase], { defaultValue: pdfExport.phase })} ${Math.round(pdfExport.progress * 100)}%` : "") ||
    renderError ||
    (renderState === "rendering" ? t("status.rendering") : "");

  useEffect(() => {
    document.documentElement.dataset.theme = globalState.theme;
    document.documentElement.lang = globalState.language === "zh" ? "zh-Hans" : globalState.language === "tw" ? "zh-Hant" : globalState.language;
    document.body.dir = globalState.direction;
    void i18n.changeLanguage(globalState.language);
  }, [globalState]);

  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      pdfAbortRef.current?.abort();
    };
  }, []);

  const runCommand = (command: MarkdownCommand) => {
    const editor = editorRef.current;
    if (!editor || !activeTab) return;
    const result = applyCommand(activeTab.content, command, editor.selectionStart, editor.selectionEnd);
    commitContent(result.value);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(result.start, result.end);
    });
  };

  const newTab = useCallback((content = "", title?: string) => {
    const tab = addTab(content, title || `${t("status.untitled")}-${untitledCounter}.md`);
    if (!tab) showToast(`Tab limit is ${MAX_TABS}.`);
  }, [addTab, t, untitledCounter]);
  const githubImport = useGitHubImport({ newTab, showToast });

  const closeTab = useCallback((id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (tab?.content.trim()) {
      setConfirmAction({
        title: "Close tab",
        message: `Close "${tab.title}"? Unsaved local changes in this tab will be removed from the workspace.`,
        confirmLabel: "Close tab",
        danger: true,
        onConfirm: () => {
          closeStoreTab(id, `${t("status.untitled")}-${untitledCounter}.md`);
          setConfirmAction(null);
        },
      });
      return;
    }
    closeStoreTab(id, `${t("status.untitled")}-${untitledCounter}.md`);
  }, [closeStoreTab, t, tabs, untitledCounter]);

  const renameTab = (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    const title = window.prompt("Rename tab", tab?.title || "");
    if (!title) return;
    renameStoreTab(id, title);
  };

  const duplicateTab = (id: string) => {
    const tab = duplicateStoreTab(id);
    if (!tab) showToast(`Tab limit is ${MAX_TABS}.`);
  };

  useGlobalShortcuts({
    activeTabId,
    editorRef,
    onCloseTab: closeTab,
    onNewTab: () => newTab(),
    onOpenFind: () => findReplace.setOpen(true),
    onRedo: redo,
    onSave: () => {
      void import("./lib/exporters").then(({ exportMarkdown }) => exportMarkdown(getExportName(activeTab?.title || "document"), text));
    },
    onToggleSyncScroll: () => updateGlobal({ syncScroll: !globalState.syncScroll }),
    onUndo: undo,
  });

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const editor = event.currentTarget;
      const result = {
        value: text.slice(0, editor.selectionStart) + "  " + text.slice(editor.selectionEnd),
        start: editor.selectionStart + 2,
        end: editor.selectionStart + 2,
      };
      commitContent(result.value);
      requestAnimationFrame(() => editor.setSelectionRange(result.start, result.end));
    }
    if (event.key === "Enter") {
      const editor = event.currentTarget;
      const result = handleSmartEnter(text, editor.selectionStart);
      if (result) {
        event.preventDefault();
        commitContent(result.value);
        requestAnimationFrame(() => editor.setSelectionRange(result.start, result.end));
      }
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const imported: MarkdownTab[] = [];
    for (const file of [...files]) {
      if (!/\.(md|markdown|txt)$/i.test(file.name)) continue;
      if (file.size > MAX_IMPORT_BYTES) {
        showToast(`${file.name} is over 10 MB.`);
        continue;
      }
      const content = await file.text();
      if (hasBinaryBytes(content)) {
        showToast(`${file.name} looks binary and was skipped.`);
        continue;
      }
      imported.push(makeTab(file.name, content));
    }
    if (!imported.length) return;
    addTabs(imported, imported[0].id);
  };

  const doCopyMarkdown = async () => {
    await navigator.clipboard.writeText(text);
    showToast(t("toast.markdownCopied"));
  };

  const exportMarkdownFile = async () => {
    const { exportMarkdown } = await import("./lib/exporters");
    exportMarkdown(getExportName(activeTab?.title || "document"), text);
  };

  const exportHtmlFile = async () => {
    const { exportHtml } = await import("./lib/exporters");
    exportHtml(getExportName(activeTab?.title || "document"), renderedHtml, activeTab?.title || t("status.document"));
  };

  const exportPreviewPng = async () => {
    if (!previewRef.current) return;
    const { exportPng } = await import("./lib/exporters");
    await exportPng(getExportName(activeTab?.title || "document"), previewRef.current);
  };

  const doCopyPreviewImage = async () => {
    if (!previewRef.current) return;
    const { copyImage } = await import("./lib/exporters");
    const ok = await copyImage(previewRef.current);
    showToast(ok ? t("toast.previewImageCopied") : t("toast.clipboardImageUnavailable"));
  };

  const doExportPdf = async () => {
    if (!previewRef.current || pdfAbortRef.current) return;
    const controller = new AbortController();
    pdfAbortRef.current = controller;
    setPdfExport({ phase: "preparing", progress: 0.04 });
    try {
      const { exportPdf } = await import("./lib/exporters");
      await exportPdf(getExportName(activeTab?.title || "document"), previewRef.current, {
        signal: controller.signal,
        onProgress: ({ phase, progress }) => setPdfExport({ phase, progress }),
      });
      showToast(t("toast.pdfSaved", { defaultValue: "PDF exported." }));
    } catch (error) {
      if (isAbortError(error)) showToast(t("toast.pdfCancelled", { defaultValue: "PDF export cancelled." }));
      else showToast(t("toast.pdfFailed", { defaultValue: "PDF export failed. Please try again." }));
    } finally {
      if (pdfAbortRef.current === controller) pdfAbortRef.current = null;
      setPdfExport(null);
    }
  };

  const cancelPdfExport = () => {
    pdfAbortRef.current?.abort();
    setPdfExport((current) => current ? { ...current, phase: "cancelling" } : current);
  };

  const requestClearDocument = () => {
    if (!text.trim()) return;
    setConfirmAction({
      title: "Clear document",
      message: "Clear the current document? This removes the text from the active tab.",
      confirmLabel: "Clear document",
      danger: true,
      onConfirm: () => {
        commitContent("");
        setConfirmAction(null);
      },
    });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      showToast("Fullscreen is unavailable in this browser.");
    }
  };

  const selectPreviewBlock = useCallback((block: PreviewBlock) => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = lineRangeToOffsets(text, block.startLine, block.endLine);
    setSelectedPreviewBlockId(block.id);
    editor.focus();
    editor.setSelectionRange(range.start, range.end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 22;
    editor.scrollTop = Math.max(0, (block.startLine - 1) * lineHeight - 80);
  }, [text]);

  const jumpToLine = useCallback((line: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = lineRangeToOffsets(text, line, line);
    editor.focus();
    editor.setSelectionRange(range.start, range.end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 22;
    editor.scrollTop = Math.max(0, (line - 1) * lineHeight - 80);
  }, [text]);

  const onScrollEditor = () => {
    if (!globalState.syncScroll || syncingRef.current || !editorRef.current || !previewPaneRef.current) return;
    syncingRef.current = true;
    const editor = editorRef.current;
    const ratio = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight);
    previewPaneRef.current.scrollTop = ratio * (previewPaneRef.current.scrollHeight - previewPaneRef.current.clientHeight);
    window.setTimeout(() => (syncingRef.current = false), 40);
  };

  const onScrollPreview = () => {
    if (!globalState.syncScroll || syncingRef.current || !editorRef.current || !previewPaneRef.current) return;
    syncingRef.current = true;
    const pane = previewPaneRef.current;
    const ratio = pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight);
    editorRef.current.scrollTop = ratio * (editorRef.current.scrollHeight - editorRef.current.clientHeight);
    window.setTimeout(() => (syncingRef.current = false), 40);
  };

  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const startPercent = globalState.splitPercent;
    const onMove = (move: PointerEvent) => {
      const width = window.innerWidth || 1;
      const delta = ((move.clientX - startX) / width) * 100;
      updateGlobal({ splitPercent: Math.min(80, Math.max(20, startPercent + delta)) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 2600);
  }

  return (
    <div
      className={`app-shell view-${globalState.viewMode}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void handleFiles(event.dataTransfer.files);
      }}
    >
      <AppHeader
        stats={stats}
        theme={globalState.theme}
        viewMode={globalState.viewMode}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onThemeChange={(theme) => updateGlobal({ theme })}
        onViewModeChange={(viewMode) => updateGlobal({ viewMode })}
      />

      <WorkspaceToolbar
        fileInputRef={fileInputRef}
        globalState={globalState}
        onGlobalChange={updateGlobal}
        onNewTab={() => newTab("", undefined)}
        onGithubImport={githubImport.open}
        onFilesSelected={(files) => void handleFiles(files)}
        onExportMarkdown={() => void exportMarkdownFile()}
        onExportHtml={() => void exportHtmlFile()}
        onExportPdf={() => void doExportPdf()}
        onExportPng={() => previewRef.current && void exportPreviewPng()}
        onCopyMarkdown={doCopyMarkdown}
        onCopyPreviewImage={doCopyPreviewImage}
        onShare={() => share.open("view")}
      />

      <nav className="tab-strip" aria-label={t("status.document")}>
        {tabs.map((tab) => (
          <button key={tab.id} className={tab.id === activeTabId ? "tab active" : "tab"} onClick={() => setActiveTabId(tab.id)} onDoubleClick={() => renameTab(tab.id)}>
            <span>{tab.title}</span>
            <small>{tab.content.length.toLocaleString()}</small>
            <i onClick={(event) => { event.stopPropagation(); duplicateTab(tab.id); }}>+</i>
            <i onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>x</i>
          </button>
        ))}
      </nav>

      <div className="format-toolbar">
        <IconButton title="Undo" onClick={undo}><Undo2 size={16} /></IconButton>
        <IconButton title="Redo" onClick={redo}><Redo2 size={16} /></IconButton>
        <IconButton title="Bold" onClick={() => runCommand("bold")}><Bold size={16} /></IconButton>
        <IconButton title="Italic" onClick={() => runCommand("italic")}><Italic size={16} /></IconButton>
        <IconButton title="Strike" onClick={() => runCommand("strike")}><Strikethrough size={16} /></IconButton>
        <IconButton title="Heading 1" onClick={() => runCommand("h1")}><Heading1 size={16} /></IconButton>
        <IconButton title="Heading 2" onClick={() => runCommand("h2")}><Heading2 size={16} /></IconButton>
        <IconButton title="Heading 3" onClick={() => runCommand("h3")}><Heading3 size={16} /></IconButton>
        <IconButton title="Heading 4" onClick={() => runCommand("h4")}><Heading4 size={16} /></IconButton>
        <IconButton title="Heading 5" onClick={() => runCommand("h5")}><Heading5 size={16} /></IconButton>
        <IconButton title="Heading 6" onClick={() => runCommand("h6")}><Heading6 size={16} /></IconButton>
        <IconButton title="Quote" onClick={() => runCommand("quote")}><TextQuote size={16} /></IconButton>
        <IconButton title="Bulleted list" onClick={() => runCommand("ul")}><List size={16} /></IconButton>
        <IconButton title="Numbered list" onClick={() => runCommand("ol")}><ListOrdered size={16} /></IconButton>
        <IconButton title="Task list" onClick={() => runCommand("task")}><ListChecks size={16} /></IconButton>
        <IconButton title="Horizontal rule" onClick={() => runCommand("hr")}><Minus size={16} /></IconButton>
        <IconButton title="Link" onClick={insertModals.openLinkModal}><Link size={16} /></IconButton>
        <IconButton title="Image" onClick={insertModals.openImageModal}><Image size={16} /></IconButton>
        <IconButton title="Reference" onClick={insertModals.openReferenceModal}><BookMarked size={16} /></IconButton>
        <IconButton title="GitHub Emojis" onClick={insertModals.openEmojiModal}><Smile size={16} /></IconButton>
        <IconButton title="Symbols & HTML entities" onClick={insertModals.openSymbolsModal}><BadgeCent size={16} /></IconButton>
        <IconButton title="Markdown alerts" onClick={insertModals.openAlertModal}><BadgeAlert size={16} /></IconButton>
        <IconButton title="Inline code" onClick={() => runCommand("inlineCode")}><Code2 size={16} /></IconButton>
        <IconButton title="Code block" onClick={() => runCommand("codeBlock")}><Braces size={16} /></IconButton>
        <IconButton title="Terminal block" onClick={() => runCommand("terminal")}><Terminal size={16} /></IconButton>
        <IconButton title="Table" onClick={insertModals.openTableModal}><Table2 size={16} /></IconButton>
        <IconButton title="Math" onClick={() => runCommand("math")}><Sigma size={16} /></IconButton>
        <IconButton title="Diagram templates" onClick={insertModals.openDiagramModal}><Play size={16} /></IconButton>
        <IconButton title="Insert date and time" onClick={() => runCommand("datetime")}><CalendarClock size={16} /></IconButton>
        <IconButton title="Uppercase" onClick={() => runCommand("upper")}><CaseUpper size={16} /></IconButton>
        <IconButton title="Lowercase" onClick={() => runCommand("lower")}><CaseLower size={16} /></IconButton>
        <IconButton title="Title case" onClick={() => runCommand("title")}><ALargeSmall size={16} /></IconButton>
        <IconButton title="Find and replace" onClick={() => findReplace.setOpen(true)}><Search size={16} /></IconButton>
        <IconButton title="Clear formatting" onClick={() => runCommand("clear")}><RefreshCw size={16} /></IconButton>
        <IconButton title="Delete current document" onClick={requestClearDocument}><Trash2 size={16} /></IconButton>
        <IconButton title="Left align" onClick={() => insertAlignment("left")}><AlignLeft size={16} /></IconButton>
        <IconButton title="Center align" onClick={() => insertAlignment("center")}><AlignCenter size={16} /></IconButton>
        <IconButton title="Right align" onClick={() => insertAlignment("right")}><AlignRight size={16} /></IconButton>
        <IconButton title="Toggle fullscreen" onClick={() => void toggleFullscreen()}><Maximize2 size={16} /></IconButton>
      </div>

      <main className="workspace" style={{ "--split": `${globalState.splitPercent}%` } as React.CSSProperties}>
        <section className="editor-pane" ref={editorPaneRef}>
          <div className="pane-title"><FilePlus2 size={16} />{activeTab?.title || t("status.untitled")}</div>
          <div className="editor-wrap">
            <pre className="line-numbers" aria-hidden="true">{lineNumbers(text)}</pre>
            <textarea
              ref={editorRef}
              value={text}
              spellCheck={false}
              onScroll={onScrollEditor}
              onKeyDown={onEditorKeyDown}
              onChange={(event) => updateActiveContent(event.target.value)}
              onBlur={(event) => commitContent(event.target.value)}
              aria-label={t("view.editor")}
            />
          </div>
        </section>
        <div className="resizer" role="separator" aria-orientation="vertical" tabIndex={0} onPointerDown={beginResize} />
        <section className="preview-pane" ref={previewPaneRef} onScroll={onScrollPreview}>
          <div className="pane-title">
            <Eye size={16} />{t("view.preview")}
            {renderState === "rendering" && <span className="render-pill">{t("status.rendering")}</span>}
            {renderError && <span className="render-pill error">{renderError}</span>}
          </div>
          <PreviewPane
            ref={previewRef}
            document={previewDocument}
            findActiveIndex={findReplace.activeMatch}
            findEditorMatchCount={findReplace.matches.length}
            findOpen={findReplace.open}
            findOptions={findReplace.options}
            offlineFirst={globalState.offlineFirst}
            selectedBlockId={selectedPreviewBlockId}
            theme={globalState.theme}
            onBlockSelect={selectPreviewBlock}
          />
        </section>
        {(toc.length > 0 || text.trim().length > 0) && (
          <aside className="toc-panel">
            {toc.length > 0 && (
              <>
                <strong>{t("view.outline")}</strong>
                {toc.map((entry) => (
                  <a key={entry.id} href={`#${entry.id}`} style={{ paddingLeft: `${(entry.level - 1) * 10}px` }}>{entry.text}</a>
                ))}
              </>
            )}
            <div className="health-panel">
              <strong><ShieldCheck size={15} /> {t("health.title")}</strong>
              <div className={`health-score ${health.score >= 86 ? "strong" : health.score >= 68 ? "good" : "weak"}`}>
                <span>{health.score}</span>
                <small>{health.score >= 86 ? t("health.strong") : health.score >= 68 ? t("health.good") : t("health.weak")}</small>
              </div>
              <div className="health-signals">
                <span>{t("health.headings", { count: health.signals.headings })}</span>
                <span>{t("health.links", { count: health.signals.links })}</span>
                <span>{t("health.images", { count: health.signals.images })}</span>
                <span>{t("health.code", { count: health.signals.codeBlocks })}</span>
              </div>
              <ul>
                {health.issues.length ? health.issues.map((issue) => (
                  <li key={`${issue.code}-${JSON.stringify(issue.params || {})}`} className={issue.level}>
                    {issue.line ? (
                      <button className="health-issue-button" type="button" onClick={() => jumpToLine(issue.line!)}>
                        {t(`health.issue.${issue.code}`, issue.params)}
                      </button>
                    ) : (
                      t(`health.issue.${issue.code}`, issue.params)
                    )}
                  </li>
                )) : (
                  <li className="info">{t("health.empty")}</li>
                )}
              </ul>
            </div>
          </aside>
        )}
      </main>

      {findReplace.open && (
        <FindReplacePanel
          activeMatch={findReplace.activeMatch}
          docked={globalState.findDocked}
          matches={findReplace.matches}
          options={findReplace.options}
          onClose={() => findReplace.setOpen(false)}
          onDockedChange={(findDocked) => updateGlobal({ findDocked })}
          onOptionsChange={findReplace.setOptions}
          onReplaceAll={findReplace.replaceEveryMatch}
          onReplaceCurrent={findReplace.replaceCurrent}
          onStep={findReplace.cycleMatch}
        />
      )}

      {githubImport.opened && <GitHubImportModal {...githubImport.modalProps} />}

      <MobileMenu
        activeTabId={activeTabId}
        globalState={globalState}
        health={health}
        opened={mobileMenuOpen}
        stats={stats}
        tabs={tabs}
        onClose={() => setMobileMenuOpen(false)}
        onCloseTab={closeTab}
        onCopyMarkdown={() => void doCopyMarkdown()}
        onCopyPreviewImage={() => void doCopyPreviewImage()}
        onDuplicateTab={duplicateTab}
        onExportHtml={() => void exportHtmlFile()}
        onExportMarkdown={() => void exportMarkdownFile()}
        onExportPdf={() => void doExportPdf()}
        onExportPng={() => previewRef.current && void exportPreviewPng()}
        onGithubImport={githubImport.open}
        onImportFiles={() => fileInputRef.current?.click()}
        onNewTab={() => newTab("", undefined)}
        onSelectTab={setActiveTabId}
        onShare={() => share.open("view")}
        onGlobalChange={updateGlobal}
      />

      <InsertModalHost {...insertModals.hostProps} />

      <ShareModal mode={share.mode} onClose={share.close} onCopy={share.copy} onModeChange={share.setModeUrl} tooLong={share.tooLong} url={share.url} />

      {confirmAction && (
        <ConfirmModal
          confirmLabel={confirmAction.confirmLabel}
          danger={confirmAction.danger}
          message={confirmAction.message}
          title={confirmAction.title}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmAction.onConfirm}
        />
      )}

      {dragging && <div className="drag-overlay">{t("status.dropMarkdown")}</div>}
      {pdfExport && (
        <div className="export-overlay" role="status" aria-live="polite">
          <div>
            <strong>{t("export.pdfTitle", { defaultValue: "Exporting PDF" })}</strong>
            <span>{t(PDF_EXPORT_LABEL_KEYS[pdfExport.phase], { defaultValue: pdfExport.phase })}</span>
          </div>
          <progress value={Math.round(pdfExport.progress * 100)} max={100} />
          <button type="button" onClick={cancelPdfExport} disabled={pdfExport.phase === "cancelling"}>
            {t("action.cancel", { defaultValue: "Cancel" })}
          </button>
        </div>
      )}
      <div className="sr-live-region" aria-live="polite" aria-atomic="true">{liveMessage}</div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );

  function insertAlignment(align: "left" | "center" | "right") {
    const editor = editorRef.current;
    if (!editor || !activeTab) return;
    const selected = text.slice(editor.selectionStart, editor.selectionEnd) || "Aligned text";
    const html = `<p align="${align}">${selected}</p>`;
    const next = text.slice(0, editor.selectionStart) + html + text.slice(editor.selectionEnd);
    commitContent(next);
  }
}

function getStats(text: string) {
  const words = (text.match(/[\p{L}\p{N}_'-]+/gu) || []).length;
  const chars = text.length;
  return { words, chars, minutes: Math.max(1, Math.ceil(words / 220)) };
}

function lineNumbers(text: string) {
  const count = Math.max(1, text.split("\n").length);
  return Array.from({ length: count }, (_, index) => index + 1).join("\n");
}

function lineRangeToOffsets(text: string, startLine: number, endLine: number) {
  const lines = splitLinesWithBreaks(text);
  const safeStartLine = Math.min(Math.max(1, startLine), lines.length);
  const safeEndLine = Math.min(Math.max(safeStartLine, endLine), lines.length);
  let start = 0;
  for (let index = 0; index < safeStartLine - 1; index += 1) {
    start += lines[index].length;
  }
  let end = start;
  for (let index = safeStartLine - 1; index < safeEndLine; index += 1) {
    end += lines[index].replace(/\r\n$|\r$|\n$/, "").length;
    if (index < safeEndLine - 1) end += lineBreakLength(lines[index]);
  }
  return { start, end };
}

function splitLinesWithBreaks(text: string) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [""];
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : [""];
}

function lineBreakLength(line: string) {
  const match = line.match(/\r\n$|\r$|\n$/);
  return match?.[0].length || 0;
}

function hasBinaryBytes(text: string) {
  return text.includes("\u0000");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default App;
