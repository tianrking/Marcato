import { CopyPlus, FileText, GitBranch, Import, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { MarkdownTab } from "../types";

interface DocumentLibraryPanelProps {
  activeTabId: string;
  opened: boolean;
  tabs: MarkdownTab[];
  onClose: () => void;
  onCloseTab: (id: string) => void;
  onDuplicateTab: (id: string) => void;
  onGithubImport: () => void;
  onImportFiles: () => void;
  onNewTab: () => void;
  onRenameTab: (id: string, title: string) => void;
  onSelectTab: (id: string) => void;
}

export function DocumentLibraryPanel({
  activeTabId,
  opened,
  tabs,
  onClose,
  onCloseTab,
  onDuplicateTab,
  onGithubImport,
  onImportFiles,
  onNewTab,
  onRenameTab,
  onSelectTab,
}: DocumentLibraryPanelProps) {
  const [query, setQuery] = useState("");
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const filteredTabs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tabs;
    return tabs.filter((tab) => `${tab.title}\n${tab.content}`.toLowerCase().includes(needle));
  }, [query, tabs]);
  const totals = useMemo(() => ({
    chars: tabs.reduce((sum, tab) => sum + tab.content.length, 0),
    docs: tabs.length,
    words: tabs.reduce((sum, tab) => sum + countWords(tab.content), 0),
  }), [tabs]);
  const [previewTabId, setPreviewTabId] = useState(activeTabId);
  useEffect(() => {
    if (opened) setPreviewTabId(activeTabId);
  }, [activeTabId, opened]);
  const previewTab = useMemo(
    () => tabs.find((tab) => tab.id === previewTabId) || tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, previewTabId, tabs],
  );
  const previewHeadings = useMemo(() => extractHeadings(previewTab?.content || ""), [previewTab]);

  useEffect(() => {
    if (!editingTabId) return;
    requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  }, [editingTabId]);

  if (!opened) return null;

  const runAndClose = (action: () => void) => {
    action();
    onClose();
  };

  const startEditing = (tab: MarkdownTab) => {
    setPreviewTabId(tab.id);
    setEditingTabId(tab.id);
    setDraftTitle(tab.title);
  };

  const finishEditing = (commit: boolean) => {
    if (!editingTabId) return;
    const tab = tabs.find((item) => item.id === editingTabId);
    const nextTitle = draftTitle.trim();
    if (commit && tab && nextTitle && nextTitle !== tab.title) {
      onRenameTab(editingTabId, nextTitle);
    }
    setEditingTabId(null);
    setDraftTitle("");
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishEditing(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishEditing(false);
    }
  };

  return (
    <div className="document-library-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="document-library" role="dialog" aria-modal="true" aria-label="Document library">
        <div className="document-library-head">
          <div>
            <span>Marcato Library</span>
            <strong>{totals.docs} docs</strong>
          </div>
          <button type="button" aria-label="Close document library" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="library-stats">
          <span><b>{totals.words.toLocaleString()}</b> words</span>
          <span><b>{totals.chars.toLocaleString()}</b> chars</span>
        </div>

        <div className="library-actions">
          <button type="button" onClick={() => runAndClose(onNewTab)}><Plus size={16} />New</button>
          <button type="button" onClick={() => runAndClose(onImportFiles)}><Import size={16} />Import</button>
          <button type="button" onClick={() => runAndClose(onGithubImport)}><GitBranch size={16} />GitHub</button>
        </div>

        <label className="library-search">
          <Search size={15} />
          <input
            autoFocus
            placeholder="Search documents"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="library-browser">
          <div className="library-list">
            {filteredTabs.length ? filteredTabs.map((tab) => {
              const active = tab.id === activeTabId;
              const previewing = previewTab?.id === tab.id;
              const editing = editingTabId === tab.id;
              return (
                <article
                  key={tab.id}
                  className={`${active ? "library-card active" : "library-card"}${previewing ? " previewing" : ""}${editing ? " editing" : ""}`}
                  onMouseEnter={() => setPreviewTabId(tab.id)}
                >
                  {editing ? (
                    <div className="library-card-main library-card-edit-shell">
                      <label>
                        <FileText size={16} />
                        <input
                          ref={editInputRef}
                          aria-label="Library document name"
                          value={draftTitle}
                          onBlur={() => finishEditing(true)}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={onEditKeyDown}
                        />
                      </label>
                      <p>{previewText(tab.content)}</p>
                      <small>{countWords(tab.content).toLocaleString()} words | {tab.content.length.toLocaleString()} chars | {formatUpdated(tab.updatedAt)}</small>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="library-card-main"
                      onClick={() => runAndClose(() => onSelectTab(tab.id))}
                      onFocus={() => setPreviewTabId(tab.id)}
                    >
                      <span><FileText size={16} />{tab.title}</span>
                      <p>{previewText(tab.content)}</p>
                      <small>{countWords(tab.content).toLocaleString()} words | {tab.content.length.toLocaleString()} chars | {formatUpdated(tab.updatedAt)}</small>
                    </button>
                  )}
                  <div className="library-card-actions">
                    <button type="button" aria-label={`Rename ${tab.title}`} onClick={() => startEditing(tab)}><Pencil size={14} /></button>
                    <button type="button" aria-label={`Duplicate ${tab.title}`} onClick={() => onDuplicateTab(tab.id)}><CopyPlus size={14} /></button>
                    <button type="button" aria-label={`Close ${tab.title}`} onClick={() => onCloseTab(tab.id)}><X size={14} /></button>
                  </div>
                </article>
              );
            }) : (
              <div className="library-empty">
                <strong>No documents found</strong>
                <span>Try another search or import Markdown files.</span>
              </div>
            )}
          </div>

          <aside className="library-preview" aria-label="Document preview">
            {previewTab ? (
              <>
                <div className="library-preview-head">
                  <span>Preview</span>
                  <strong>{previewTab.title}</strong>
                  <small>{countWords(previewTab.content).toLocaleString()} words | {previewTab.content.length.toLocaleString()} chars | {formatUpdated(previewTab.updatedAt)}</small>
                </div>
                <p>{previewText(previewTab.content)}</p>
                <div className="library-outline-preview">
                  <span>Outline</span>
                  {previewHeadings.length ? (
                    previewHeadings.slice(0, 8).map((heading) => (
                      <button key={`${heading.line}-${heading.text}`} type="button" onClick={() => runAndClose(() => onSelectTab(previewTab.id))}>
                        <small>H{heading.level}</small>
                        <span>{heading.text}</span>
                      </button>
                    ))
                  ) : (
                    <em>No headings yet.</em>
                  )}
                </div>
              </>
            ) : (
              <div className="library-empty">
                <strong>No preview</strong>
                <span>Create or import a Markdown file to inspect it.</span>
              </div>
            )}
          </aside>
        </div>
      </aside>
    </div>
  );
}

function previewText(content: string) {
  return content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/[#>*_`~[\]()!-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150) || "Empty document";
}

function countWords(content: string) {
  const cjk = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (content.match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g) || []).length;
  return cjk + words;
}

function extractHeadings(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match) return null;
      return {
        level: match[1].length,
        line: index + 1,
        text: match[2].replace(/[#*_`~[\]()]/g, "").trim(),
      };
    })
    .filter((heading): heading is { level: number; line: number; text: string } => Boolean(heading?.text));
}

function formatUpdated(value: number) {
  const deltaSeconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (deltaSeconds < 60) return "just now";
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}
