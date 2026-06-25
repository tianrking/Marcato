import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, CopyPlus, MoreHorizontal, Pencil, Plus, X } from "lucide-react";
import type { MarkdownTab } from "../types";

interface TabStripProps {
  activeTabId: string;
  tabs: MarkdownTab[];
  onCloseTab: (id: string) => void;
  onDuplicateTab: (id: string) => void;
  onNewTab: () => void;
  onRenameTab: (id: string) => void;
  onReorderTab: (draggedId: string, targetId: string) => void;
  onSelectTab: (id: string) => void;
}

export function TabStrip({
  activeTabId,
  tabs,
  onCloseTab,
  onDuplicateTab,
  onNewTab,
  onRenameTab,
  onReorderTab,
  onSelectTab,
}: TabStripProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [menuTabId, setMenuTabId] = useState<string | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));

  const scrollBy = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
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
          const menuOpen = menuTabId === tab.id;
          return (
            <div
              key={tab.id}
              className={active ? "tab-frame active" : "tab-frame"}
              draggable
              onDragStart={() => setDraggedTabId(tab.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedTabId) onReorderTab(draggedTabId, tab.id);
                setDraggedTabId(null);
              }}
              onDragEnd={() => setDraggedTabId(null)}
            >
              <button
                id={`tab-${tab.id}`}
                className="tab"
                role="tab"
                type="button"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={() => onRenameTab(tab.id)}
              >
                <span>{tab.title}</span>
                <small>{tab.content.length.toLocaleString()}</small>
              </button>
              <button
                className="tab-action"
                type="button"
                aria-label={`Actions for ${tab.title}`}
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuTabId(menuOpen ? null : tab.id);
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
              {menuOpen && (
                <div className="tab-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { onRenameTab(tab.id); setMenuTabId(null); }}>
                    <Pencil size={14} /> Rename
                  </button>
                  <button type="button" role="menuitem" onClick={() => { onDuplicateTab(tab.id); setMenuTabId(null); }}>
                    <CopyPlus size={14} /> Duplicate
                  </button>
                  <button type="button" role="menuitem" onClick={() => { onCloseTab(tab.id); setMenuTabId(null); }}>
                    <X size={14} /> Close
                  </button>
                </div>
              )}
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
