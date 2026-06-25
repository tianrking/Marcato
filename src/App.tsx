import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileDown,
  FileImage,
  FilePlus2,
  FileSearch,
  GitBranch,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Languages,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Moon,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Replace,
  Save,
  Search,
  Share2,
  ShieldCheck,
  Sigma,
  SplitSquareHorizontal,
  Strikethrough,
  Sun,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import { MAX_IMPORT_BYTES, MAX_TABS, SHARE_URL_SOFT_LIMIT } from "./lib/constants";
import { applyCommand, handleSmartEnter, type MarkdownCommand } from "./lib/editorCommands";
import { copyImage, exportHtml, exportMarkdown, exportPdf, exportPng, getExportName } from "./lib/exporters";
import { analyzeDocumentHealth } from "./lib/documentHealth";
import { buildDiffPreview, findMatches, replaceAll, replaceOne } from "./lib/findReplace";
import { fetchMarkdownFile, importFromGitHubUrl } from "./lib/githubImport";
import { i18n, LANGUAGE_LABELS } from "./lib/i18n";
import { renderMarkdownToHtml } from "./lib/markdownCore";
import { sanitizePreviewHtml } from "./lib/sanitizer";
import { buildShareUrl, readShareFromLocation } from "./lib/share";
import {
  loadActiveTabId,
  loadDefaultMarkdown,
  loadGlobalState,
  loadTabs,
  loadUntitledCounter,
  makeTab,
  saveActiveTabId,
  saveGlobalState,
  saveTabs,
  saveUntitledCounter,
} from "./lib/storage";
import type { FindOptions, GitHubMarkdownFile, GlobalState, MarkdownTab, RenderResult, ViewMode } from "./types";

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
  const [globalState, setGlobalState] = useState<GlobalState>(() => loadGlobalState());
  const [tabs, setTabs] = useState<MarkdownTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [untitledCounter, setUntitledCounter] = useState(() => loadUntitledCounter());
  const [renderedHtml, setRenderedHtml] = useState("");
  const [toc, setToc] = useState<RenderResult["toc"]>([]);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "error">("idle");
  const [renderError, setRenderError] = useState("");
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

  useEffect(() => {
    document.documentElement.dataset.theme = globalState.theme;
    document.documentElement.lang = globalState.language === "zh" ? "zh-Hans" : globalState.language === "tw" ? "zh-Hant" : globalState.language;
    document.body.dir = globalState.direction;
    void i18n.changeLanguage(globalState.language);
    saveGlobalState(globalState);
  }, [globalState]);

  useEffect(() => {
    const shared = readShareFromLocation();
    const storedTabs = loadTabs();
    void loadDefaultMarkdown().then((defaultMarkdown) => {
      if (shared) {
        const tab = makeTab(shared.editable ? "Shared edit" : "Shared view", shared.markdown);
        setTabs([tab]);
        setActiveTabId(tab.id);
        return;
      }
      if (storedTabs.length) {
        const storedActive = loadActiveTabId();
        setTabs(storedTabs);
        setActiveTabId(storedActive && storedTabs.some((tab) => tab.id === storedActive) ? storedActive : storedTabs[0].id);
      } else {
        const tab = makeTab("Welcome.md", defaultMarkdown);
        setTabs([tab]);
        setActiveTabId(tab.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!tabs.length) return;
    saveTabs(tabs);
    if (activeTabId) saveActiveTabId(activeTabId);
  }, [tabs, activeTabId]);

  useEffect(() => {
    saveUntitledCounter(untitledCounter);
  }, [t, untitledCounter]);

  useEffect(() => {
    if (!activeTab) return;
    setRenderState("rendering");
    const requestId = ++renderRequestRef.current;
    const timer = window.setTimeout(() => {
      renderWithWorker(activeTab.content, requestId)
        .then((result) => {
          if (renderRequestRef.current !== requestId) return;
          setRenderedHtml(resultToHtml(result));
          setToc(result.toc);
          setRenderState("idle");
          setRenderError("");
        })
        .catch((error) => {
          if (renderRequestRef.current !== requestId) return;
          try {
            const fallback = renderMarkdownToHtml(activeTab.content, false);
            setRenderedHtml(resultToHtml(fallback));
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

  const updateGlobal = useCallback((patch: Partial<GlobalState>) => {
    setGlobalState((state) => ({ ...state, ...patch }));
  }, []);

  const updateActiveContent = useCallback((content: string, commitHistory = false) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        let history = tab.history;
        let historyIndex = tab.historyIndex;
        if (commitHistory && content !== tab.content) {
          history = tab.history.slice(0, tab.historyIndex + 1).concat(content).slice(-80);
          historyIndex = history.length - 1;
        }
        return { ...tab, content, updatedAt: Date.now(), history, historyIndex };
      }),
    );
  }, [activeTabId]);

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
    setTabs((current) => {
      if (current.length >= MAX_TABS) {
        showToast(`Tab limit is ${MAX_TABS}.`);
        return current;
      }
      const nextTitle = title || `${t("status.untitled")}-${untitledCounter}.md`;
      const tab = makeTab(nextTitle, content);
      setActiveTabId(tab.id);
      setUntitledCounter((value) => value + 1);
      return [...current, tab];
    });
  }, [untitledCounter]);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        const tab = makeTab(`${t("status.untitled")}-${untitledCounter}.md`, "");
        setActiveTabId(tab.id);
        setUntitledCounter((value) => value + 1);
        return [tab];
      }
      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (id === activeTabId) setActiveTabId(next[Math.max(0, index - 1)]?.id || next[0].id);
      return next;
    });
  }, [activeTabId, t, untitledCounter]);

  const renameTab = (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    const title = window.prompt("Rename tab", tab?.title || "");
    if (!title) return;
    setTabs((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
  };

  const duplicateTab = (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (tab) newTab(tab.content, `${tab.title.replace(/\.md$/i, "")} copy.md`);
  };

  const undo = () => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeTabId || tab.historyIndex <= 0) return tab;
        const historyIndex = tab.historyIndex - 1;
        return { ...tab, historyIndex, content: tab.history[historyIndex], updatedAt: Date.now() };
      }),
    );
  };

  const redo = () => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeTabId || tab.historyIndex >= tab.history.length - 1) return tab;
        const historyIndex = tab.historyIndex + 1;
        return { ...tab, historyIndex, content: tab.history[historyIndex], updatedAt: Date.now() };
      }),
    );
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
    setTabs((current) => [...current, ...imported].slice(0, MAX_TABS));
    setActiveTabId(imported[0].id);
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
      <header className="app-header">
        <div className="brand">
          <img src="/icon.jpg" alt="" />
          <div>
            <h1>{t("app.title")}</h1>
            <p>{stats.minutes} min read | {stats.words} words | {stats.chars} chars</p>
          </div>
        </div>
        <div className="header-actions">
          <Segmented
            value={globalState.viewMode}
            options={[
              ["editor", <PanelLeft key="editor" size={16} />, t("view.editor")],
              ["split", <SplitSquareHorizontal key="split" size={16} />, t("view.split")],
              ["preview", <PanelRight key="preview" size={16} />, t("view.preview")],
            ]}
            onChange={(value) => updateGlobal({ viewMode: value as ViewMode })}
          />
          <IconButton title="Toggle theme" onClick={() => updateGlobal({ theme: globalState.theme === "dark" ? "light" : "dark" })}>
            {globalState.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <IconButton title="GitHub" onClick={() => window.open("https://github.com/ThisIs-Developer/Markdown-Viewer", "_blank", "noopener")}>
            <GitBranch size={17} />
          </IconButton>
        </div>
      </header>

      <div className="workspace-toolbar">
        <div className="toolbar-group">
          <button onClick={() => newTab("", undefined)}><Plus size={16} />{t("action.new")}</button>
          <button onClick={() => fileInputRef.current?.click()}><Download size={16} />{t("action.import")}</button>
          <button onClick={openGithubImport}><GitBranch size={16} />GitHub</button>
          <input ref={fileInputRef} hidden type="file" multiple accept=".md,.markdown,.txt" onChange={(event) => event.target.files && void handleFiles(event.target.files)} />
        </div>
        <div className="toolbar-group">
          <button onClick={() => exportMarkdown(getExportName(activeTab?.title || "document"), text)}><Save size={16} />MD</button>
          <button onClick={() => exportHtml(getExportName(activeTab?.title || "document"), renderedHtml, activeTab?.title || "Document")}><FileCode2 size={16} />HTML</button>
          <button onClick={() => previewRef.current && void exportPdf(getExportName(activeTab?.title || "document"), previewRef.current)}><FileDown size={16} />PDF</button>
          <button onClick={() => previewRef.current && void exportPng(getExportName(activeTab?.title || "document"), previewRef.current)}><FileImage size={16} />PNG</button>
          <button onClick={doCopyMarkdown}><Copy size={16} />{t("action.copy")}</button>
          <button onClick={doCopyPreviewImage}><FileImage size={16} />{t("action.copyPng")}</button>
          <button onClick={() => void doShare(true)}><Share2 size={16} />{t("action.share")}</button>
        </div>
        <div className="toolbar-group compact">
          <label><input type="checkbox" checked={globalState.syncScroll} onChange={(event) => updateGlobal({ syncScroll: event.target.checked })} />{t("setting.sync")}</label>
          <label><input type="checkbox" checked={globalState.offlineFirst} onChange={(event) => updateGlobal({ offlineFirst: event.target.checked })} />{t("setting.offlineFirst")}</label>
          <select value={globalState.language} onChange={(event) => updateGlobal({ language: event.target.value })} title={t("setting.language")}>
            {Object.entries(LANGUAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button onClick={() => updateGlobal({ direction: globalState.direction === "rtl" ? "ltr" : "rtl" })}><Languages size={16} />{globalState.direction.toUpperCase()}</button>
        </div>
      </div>

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
          <article
            ref={previewRef}
            className="markdown-body preview-article"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
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
        <Modal title={t("github.importTitle")} onClose={() => setGithubOpen(false)}>
          <div className="github-import">
            <input value={githubUrl} placeholder={t("github.placeholder")} onChange={(event) => setGithubUrl(event.target.value)} />
            <button onClick={() => void listGithubFiles()}><Search size={15} />{t("github.listFiles")}</button>
            <div className="github-list">
              {githubFiles.map((file) => (
                <label key={file.path}>
                  <input
                    type="checkbox"
                    checked={selectedGithubPaths.has(file.path)}
                    onChange={(event) => {
                      const next = new Set(selectedGithubPaths);
                      if (event.target.checked) next.add(file.path);
                      else next.delete(file.path);
                      setSelectedGithubPaths(next);
                    }}
                  />
                  {file.path}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={() => setSelectedGithubPaths(new Set(githubFiles.map((file) => file.path)))}>{t("action.selectAll")}</button>
              <button onClick={() => void importGithubSelection()}>{t("action.importSelected")}</button>
            </div>
          </div>
        </Modal>
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

function resultToHtml(result: RenderResult) {
  if (result.mode === "segmented") {
    return sanitizePreviewHtml(
      (result.blocks || [])
        .map((block) => `<div class="preview-block" data-start-line="${block.startLine}" data-end-line="${block.endLine}">${block.html}</div>`)
        .join("\n"),
    );
  }
  return sanitizePreviewHtml(result.html || "");
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

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, React.ReactNode, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([id, icon, label]) => (
        <button key={id} title={label} className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {icon}
        </button>
      ))}
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="icon-button" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button onClick={onClose}>x</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default App;
