import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, X } from "lucide-react";
import type { MarkdownTab } from "../types";

interface TabStripProps {
  activeTabId: string;
  tabs: MarkdownTab[];
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onRenameTab: (id: string, title: string) => void;
  onReorderTab: (draggedId: string, targetId: string) => void;
  onSelectTab: (id: string) => void;
}

export function TabStrip({
  activeTabId,
  tabs,
  onCloseTab,
  onNewTab,
  onRenameTab,
  onReorderTab,
  onSelectTab,
}: TabStripProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));

  useEffect(() => {
    if (!editingTabId) return;
    requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  }, [editingTabId]);

  const scrollBy = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
  };

  const startEditing = (tab: MarkdownTab) => {
    onSelectTab(tab.id);
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

  const moveFocus = (nextIndex: number) => {
    const tab = tabs[(nextIndex + tabs.length) % tabs.length];
    if (!tab) return;
    onSelectTab(tab.id);
    requestAnimationFrame(() => document.getElementById(`tab-${tab.id}`)?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!tabs.length) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(activeIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(tabs.length - 1);
    } else if (event.key === "F2" && activeTabId) {
      event.preventDefault();
      const tab = tabs.find((item) => item.id === activeTabId);
      if (tab) startEditing(tab);
    } else if (event.key === "Delete" && activeTabId) {
      event.preventDefault();
      onCloseTab(activeTabId);
    }
  };

  return (
    <nav className="tab-strip-shell" aria-label="Documents">
      <button className="tab-scroll-button" type="button" aria-label="Scroll tabs left" onClick={() => scrollBy(-1)}>
        <ChevronLeft size={16} />
      </button>
      <div ref={scrollerRef} className="tab-strip" role="tablist" aria-label="Open documents" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`${active ? "tab-frame active" : "tab-frame"}${editingTabId === tab.id ? " editing" : ""}`}
              draggable={editingTabId !== tab.id}
              onDragStart={() => setDraggedTabId(tab.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedTabId) onReorderTab(draggedTabId, tab.id);
                setDraggedTabId(null);
              }}
              onDragEnd={() => setDraggedTabId(null)}
            >
              {editingTabId === tab.id ? (
                <div className="tab tab-edit-shell">
                  <input
                    ref={editInputRef}
                    aria-label="Tab name"
                    className="tab-title-input"
                    value={draftTitle}
                    onBlur={() => finishEditing(true)}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        finishEditing(true);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        finishEditing(false);
                      }
                    }}
                  />
                  <small>{tab.content.length.toLocaleString()}</small>
                </div>
              ) : (
                <button
                  id={`tab-${tab.id}`}
                  className="tab"
                  role="tab"
                  type="button"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onSelectTab(tab.id)}
                  onDoubleClick={() => startEditing(tab)}
                >
                  <span>{tab.title}</span>
                  <small>{tab.content.length.toLocaleString()}</small>
                </button>
              )}
              <button
                className="tab-action"
                type="button"
                aria-label={`Rename ${tab.title}`}
                title={`Rename ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  startEditing(tab);
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              <button
                className="tab-close"
                type="button"
                aria-label={`Close ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="tab-scroll-button" type="button" aria-label="Scroll tabs right" onClick={() => scrollBy(1)}>
        <ChevronRight size={16} />
      </button>
      <button className="tab-new-button" type="button" aria-label="New tab" onClick={onNewTab}>
        <Plus size={16} />
      </button>
    </nav>
  );
}
