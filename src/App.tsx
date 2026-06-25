import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Code2,
  Eye,
  FilePlus2,
  FileSearch,
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
  Replace,
  Search,
  ShieldCheck,
  Sigma,
  Strikethrough,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import { AppHeader } from "./components/AppHeader";
import { IconButton, Modal } from "./components/Common";
import { GitHubImportModal } from "./components/GitHubImportModal";
import { PreviewPane } from "./components/PreviewPane";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import { MAX_IMPORT_BYTES, MAX_TABS, SHARE_URL_SOFT_LIMIT } from "./lib/constants";
import { applyCommand, handleSmartEnter, type MarkdownCommand } from "./lib/editorCommands";
import { copyImage, exportHtml, exportMarkdown, exportPdf, exportPng, getExportName } from "./lib/exporters";
import { analyzeDocumentHealth } from "./lib/documentHealth";
import { buildDiffPreview, findMatches, replaceAll, replaceOne } from "./lib/findReplace";
import { fetchMarkdownFile, importFromGitHubUrl } from "./lib/githubImport";
import { i18n } from "./lib/i18n";
import { renderMarkdownToHtml } from "./lib/markdownCore";
import { createPreviewDocument, EMPTY_PREVIEW_DOCUMENT, previewDocumentToHtml, type PreviewBlock } from "./lib/previewDocument";
import { buildShareUrl } from "./lib/share";
import { makeTab } from "./lib/storage";
import { useAppStore } from "./stores/appStore";
import type { FindOptions, GitHubMarkdownFile, MarkdownTab, RenderResult } from "./types";

const INITIAL_FIND: FindOptions = {
  query: "",
  replacement: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  inSelection: false,
  preserveCase: false,
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
  const [previewDocument, setPreviewDocument] = useState(EMPTY_PREVIEW_DOCUMENT);
  const [toc, setToc] = useState<RenderResult["toc"]>([]);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "error">("idle");
  const [renderError, setRenderError] = useState("");
  const [selectedPreviewBlockId, setSelectedPreviewBlockId] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findOptions, setFindOptions] = useState<FindOptions>(INITIAL_FIND);
  const [activeMatch, setActiveMatch] = useState(0);
  const [shareUrl, setShareUrl] = useState("");
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubFiles, setGithubFiles] = useState<GitHubMarkdownFile[]>([]);
  const [selectedGithubPaths, setSelectedGithubPaths] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const renderRequestRef = useRef(0);
  const syncingRef = useRef(false);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  );
  const text = activeTab?.content || "";
  const matches = useMemo(() => findMatches(text, findOptions, getCurrentSelection(editorRef.current)), [text, findOptions]);
  const stats = useMemo(() => getStats(text), [text]);
  const health = useMemo(() => analyzeDocumentHealth(text), [text]);
  const renderedHtml = useMemo(() => previewDocumentToHtml(previewDocument), [previewDocument]);

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
    if (!activeTab) return;
    setRenderState("rendering");
    const requestId = ++renderRequestRef.current;
    const timer = window.setTimeout(() => {
      renderWithWorker(activeTab.content, requestId)
        .then((result) => {
          if (renderRequestRef.current !== requestId) return;
          const nextDocument = createPreviewDocument(result);
          setPreviewDocument(nextDocument);
          setToc(result.toc);
          setRenderState("idle");
          setRenderError("");
        })
        .catch((error) => {
          if (renderRequestRef.current !== requestId) return;
          try {
            const fallback = renderMarkdownToHtml(activeTab.content, false);
            const nextDocument = createPreviewDocument(fallback);
            setPreviewDocument(nextDocument);
            setToc(fallback.toc);
            setRenderState("idle");
            setRenderError("");
          } catch {
            setRenderState("error");
            setRenderError(error instanceof Error ? error.message : "Render failed");
          }
        });
    }, getRenderDelay(activeTab.content));
    return () => window.clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    if (!previewRef.current) return;
    const root = previewRef.current;
    let cancelled = false;
    void import("./lib/diagramRenderers").then(({ disposePreviewResources, postProcessPreview }) => {
      if (cancelled) return;
      disposePreviewResources(root);
      void postProcessPreview(root, globalState.theme, globalState.offlineFirst);
    });
    return () => {
      cancelled = true;
      void import("./lib/diagramRenderers").then(({ disposePreviewResources }) => disposePreviewResources(root));
    };
  }, [renderedHtml, globalState.theme, globalState.offlineFirst]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod && !(event.altKey && event.shiftKey)) return;
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        exportMarkdown(getExportName(activeTab?.title || "document"), text);
      }
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen(true);
      }
      if (mod && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setFindOpen(true);
      }
      if ((mod && event.key.toLowerCase() === "t") || (event.altKey && event.shiftKey && event.key.toLowerCase() === "t")) {
        event.preventDefault();
        newTab();
      }
      if ((mod && event.key.toLowerCase() === "w") || (event.altKey && event.shiftKey && event.key.toLowerCase() === "w")) {
        event.preventDefault();
        closeTab(activeTabId);
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        updateGlobal({ syncScroll: !globalState.syncScroll });
      }
      if (mod && event.key.toLowerCase() === "z" && editorRef.current === document.activeElement) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (mod && event.key.toLowerCase() === "y" && editorRef.current === document.activeElement) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId, globalState.syncScroll, text, activeTab?.title]);

  const commitContent = useCallback((content: string) => updateActiveContent(content, true), [updateActiveContent]);

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

  const closeTab = useCallback((id: string) => {
    closeStoreTab(id, `${t("status.untitled")}-${untitledCounter}.md`);
  }, [closeStoreTab, t, untitledCounter]);

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

  const openGithubImport = async () => {
    setGithubFiles([]);
    setSelectedGithubPaths(new Set());
    setGithubOpen(true);
  };

  const listGithubFiles = async () => {
    try {
      const files = await importFromGitHubUrl(githubUrl);
      setGithubFiles(files);
      setSelectedGithubPaths(new Set(files.length === 1 ? [files[0].path] : files.map((file) => file.path)));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("error.githubImportFailed"));
    }
  };

  const importGithubSelection = async () => {
    const files = githubFiles.filter((file) => selectedGithubPaths.has(file.path));
    for (const file of files) {
      const content = await fetchMarkdownFile(file);
      newTab(content, file.name);
      await delay(120);
    }
    setGithubOpen(false);
  };

  const doShare = async (editable: boolean) => {
    const url = buildShareUrl(text, editable);
    setShareUrl(url);
    if (url.length <= SHARE_URL_SOFT_LIMIT) {
      await navigator.clipboard.writeText(url);
      showToast(t("toast.shareCopied"));
    } else {
      showToast(t("toast.shareTooLong"));
    }
  };

  const doCopyMarkdown = async () => {
    await navigator.clipboard.writeText(text);
    showToast(t("toast.markdownCopied"));
  };

  const doCopyPreviewImage = async () => {
    if (!previewRef.current) return;
    const ok = await copyImage(previewRef.current);
    showToast(ok ? t("toast.previewImageCopied") : t("toast.clipboardImageUnavailable"));
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

  const cycleMatch = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (activeMatch + direction + matches.length) % matches.length;
    setActiveMatch(next);
    const match = matches[next];
    editorRef.current?.focus();
    editorRef.current?.setSelectionRange(match.start, match.end);
  };

  const replaceCurrent = () => {
    const match = matches[activeMatch];
    if (!match) return;
    commitContent(replaceOne(text, match, findOptions));
  };

  const replaceEveryMatch = () => {
    if (!matches.length) return;
    const preview = buildDiffPreview(text, matches, findOptions);
    if (window.confirm(`${t("confirm.replaceMatches", { count: matches.length })}\n\n${preview}`)) {
      commitContent(replaceAll(text, matches, findOptions));
    }
  };

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
    window.clearTimeout((showToast as any).timer);
    (showToast as any).timer = window.setTimeout(() => setToast(""), 2600);
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
        onThemeChange={(theme) => updateGlobal({ theme })}
        onViewModeChange={(viewMode) => updateGlobal({ viewMode })}
      />

      <WorkspaceToolbar
        fileInputRef={fileInputRef}
        globalState={globalState}
        onGlobalChange={updateGlobal}
        onNewTab={() => newTab("", undefined)}
        onGithubImport={openGithubImport}
        onFilesSelected={(files) => void handleFiles(files)}
        onExportMarkdown={() => exportMarkdown(getExportName(activeTab?.title || "document"), text)}
        onExportHtml={() => exportHtml(getExportName(activeTab?.title || "document"), renderedHtml, activeTab?.title || t("status.document"))}
        onExportPdf={() => previewRef.current && void exportPdf(getExportName(activeTab?.title || "document"), previewRef.current)}
        onExportPng={() => previewRef.current && void exportPng(getExportName(activeTab?.title || "document"), previewRef.current)}
        onCopyMarkdown={doCopyMarkdown}
        onCopyPreviewImage={doCopyPreviewImage}
        onShare={() => void doShare(true)}
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
        <IconButton title="Bulleted list" onClick={() => runCommand("ul")}><List size={16} /></IconButton>
        <IconButton title="Numbered list" onClick={() => runCommand("ol")}><ListOrdered size={16} /></IconButton>
        <IconButton title="Task list" onClick={() => runCommand("task")}><ListChecks size={16} /></IconButton>
        <IconButton title="Link" onClick={() => runCommand("link")}><Link size={16} /></IconButton>
        <IconButton title="Image" onClick={() => runCommand("image")}><Image size={16} /></IconButton>
        <IconButton title="Inline code" onClick={() => runCommand("inlineCode")}><Code2 size={16} /></IconButton>
        <IconButton title="Code block" onClick={() => runCommand("codeBlock")}><Braces size={16} /></IconButton>
        <IconButton title="Table" onClick={() => runCommand("table")}><Table2 size={16} /></IconButton>
        <IconButton title="Math" onClick={() => runCommand("math")}><Sigma size={16} /></IconButton>
        <IconButton title="Mermaid" onClick={() => runCommand("mermaid")}><Play size={16} /></IconButton>
        <IconButton title="Find and replace" onClick={() => setFindOpen(true)}><Search size={16} /></IconButton>
        <IconButton title="Clear formatting" onClick={() => runCommand("clear")}><RefreshCw size={16} /></IconButton>
        <IconButton title="Delete current document" onClick={() => commitContent("")}><Trash2 size={16} /></IconButton>
        <IconButton title="Left align" onClick={() => insertAlignment("left")}><AlignLeft size={16} /></IconButton>
        <IconButton title="Center align" onClick={() => insertAlignment("center")}><AlignCenter size={16} /></IconButton>
        <IconButton title="Right align" onClick={() => insertAlignment("right")}><AlignRight size={16} /></IconButton>
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
            selectedBlockId={selectedPreviewBlockId}
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
                {(health.issues.length ? health.issues : [{ level: "info" as const, message: t("health.empty") }]).map((issue) => (
                  <li key={issue.message} className={issue.level}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </main>

      {findOpen && (
        <div className={globalState.findDocked ? "find-panel docked" : "find-panel"}>
          <div className="modal-head">
            <strong><FileSearch size={16} /> {t("find.title")}</strong>
            <button onClick={() => setFindOpen(false)}>x</button>
          </div>
          <input value={findOptions.query} placeholder={t("find.find")} onChange={(event) => setFindOptions({ ...findOptions, query: event.target.value })} />
          <input value={findOptions.replacement} placeholder={t("find.replacement")} onChange={(event) => setFindOptions({ ...findOptions, replacement: event.target.value })} />
          <div className="check-grid">
            <label><input type="checkbox" checked={findOptions.caseSensitive} onChange={(event) => setFindOptions({ ...findOptions, caseSensitive: event.target.checked })} />{t("find.case")}</label>
            <label><input type="checkbox" checked={findOptions.wholeWord} onChange={(event) => setFindOptions({ ...findOptions, wholeWord: event.target.checked })} />{t("find.word")}</label>
            <label><input type="checkbox" checked={findOptions.regex} onChange={(event) => setFindOptions({ ...findOptions, regex: event.target.checked })} />{t("find.regex")}</label>
            <label><input type="checkbox" checked={findOptions.inSelection} onChange={(event) => setFindOptions({ ...findOptions, inSelection: event.target.checked })} />{t("find.selection")}</label>
            <label><input type="checkbox" checked={findOptions.preserveCase} onChange={(event) => setFindOptions({ ...findOptions, preserveCase: event.target.checked })} />{t("find.preserveCase")}</label>
            <label><input type="checkbox" checked={globalState.findDocked} onChange={(event) => updateGlobal({ findDocked: event.target.checked })} />{t("find.dock")}</label>
          </div>
          <div className="modal-actions">
            <button onClick={() => cycleMatch(-1)}>{t("find.prev")}</button>
            <button onClick={() => cycleMatch(1)}>{t("find.next")}</button>
            <button onClick={replaceCurrent}><Replace size={15} />{t("find.current")}</button>
            <button onClick={replaceEveryMatch}><Replace size={15} />{t("find.all")}</button>
          </div>
          <small>{matches.length ? `${activeMatch + 1} / ${matches.length}` : t("find.noMatches")}</small>
        </div>
      )}

      {githubOpen && (
        <GitHubImportModal
          url={githubUrl}
          files={githubFiles}
          selectedPaths={selectedGithubPaths}
          onUrlChange={setGithubUrl}
          onListFiles={() => void listGithubFiles()}
          onSelectedPathsChange={setSelectedGithubPaths}
          onImport={() => void importGithubSelection()}
          onClose={() => setGithubOpen(false)}
        />
      )}

      {shareUrl && (
        <Modal title="Share URL" onClose={() => setShareUrl("")}>
          <textarea className="share-url" readOnly value={shareUrl} />
          <div className="modal-actions">
            <button onClick={() => void doShare(false)}>{t("status.viewOnlyShare")}</button>
            <button onClick={() => void doShare(true)}>{t("status.editableShare")}</button>
            <button onClick={() => void navigator.clipboard.writeText(shareUrl)}>{t("action.copy")}</button>
          </div>
        </Modal>
      )}

      {dragging && <div className="drag-overlay">{t("status.dropMarkdown")}</div>}
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

function renderWithWorker(markdown: string, requestId: number): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const timeout = window.setTimeout(() => reject(new Error("Preview worker timed out")), 6000);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.id !== requestId) return;
      window.clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      if (event.data.ok) resolve(event.data.result as RenderResult);
      else reject(new Error(event.data.error || "Preview worker failed"));
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id: requestId, markdown, segmented: true });
  });
}

let workerSingleton: Worker | null = null;
function getWorker() {
  if (!workerSingleton) {
    workerSingleton = new Worker(new URL("./workers/markdown.worker.ts", import.meta.url), { type: "module" });
  }
  return workerSingleton;
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
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const safeStartLine = Math.min(Math.max(1, startLine), lines.length);
  const safeEndLine = Math.min(Math.max(safeStartLine, endLine), lines.length);
  let start = 0;
  for (let index = 0; index < safeStartLine - 1; index += 1) {
    start += lines[index].length + 1;
  }
  let end = start;
  for (let index = safeStartLine - 1; index < safeEndLine; index += 1) {
    end += lines[index].length;
    if (index < safeEndLine - 1) end += 1;
  }
  return { start, end };
}

function getRenderDelay(text: string) {
  if (text.length > 80_000) return 420;
  if (text.length > 20_000) return 240;
  return 90;
}

function getCurrentSelection(editor: HTMLTextAreaElement | null) {
  if (!editor) return undefined;
  if (editor.selectionStart === editor.selectionEnd) return undefined;
  return { start: editor.selectionStart, end: editor.selectionEnd };
}

function hasBinaryBytes(text: string) {
  return text.includes("\u0000");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default App;
