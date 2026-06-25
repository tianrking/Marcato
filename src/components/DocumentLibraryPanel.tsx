import { CopyPlus, FileText, GitBranch, Import, Pencil, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
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
  onRenameTab: (id: string) => void;
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

  if (!opened) return null;

  const runAndClose = (action: () => void) => {
    action();
    onClose();
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

        <div className="library-list">
          {filteredTabs.length ? filteredTabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <article key={tab.id} className={active ? "library-card active" : "library-card"}>
                <button type="button" className="library-card-main" onClick={() => runAndClose(() => onSelectTab(tab.id))}>
                  <span><FileText size={16} />{tab.title}</span>
                  <p>{previewText(tab.content)}</p>
                  <small>{countWords(tab.content).toLocaleString()} words | {tab.content.length.toLocaleString()} chars</small>
                </button>
                <div className="library-card-actions">
                  <button type="button" aria-label={`Rename ${tab.title}`} onClick={() => runAndClose(() => onRenameTab(tab.id))}><Pencil size={14} /></button>
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
