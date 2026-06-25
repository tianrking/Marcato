import { useEffect, type RefObject } from "react";

interface GlobalShortcutOptions {
  activeTabId: string;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onOpenFind: () => void;
  onRedo: () => void;
  onSave: () => void;
  onToggleSyncScroll: () => void;
  onUndo: () => void;
}

export function useGlobalShortcuts({
  activeTabId,
  editorRef,
  onCloseTab,
  onNewTab,
  onOpenFind,
  onRedo,
  onSave,
  onToggleSyncScroll,
  onUndo,
}: GlobalShortcutOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod && !(event.altKey && event.shiftKey)) return;

      const key = event.key.toLowerCase();
      if (mod && key === "s" && !event.shiftKey) {
        event.preventDefault();
        onSave();
      }
      if (mod && (key === "f" || key === "h")) {
        event.preventDefault();
        onOpenFind();
      }
      if ((mod && key === "t") || (event.altKey && event.shiftKey && key === "t")) {
        event.preventDefault();
        onNewTab();
      }
      if ((mod && key === "w") || (event.altKey && event.shiftKey && key === "w")) {
        event.preventDefault();
        onCloseTab(activeTabId);
      }
      if (mod && event.shiftKey && key === "s") {
        event.preventDefault();
        onToggleSyncScroll();
      }
      if (mod && key === "z" && editorRef.current === document.activeElement) {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
      }
      if (mod && key === "y" && editorRef.current === document.activeElement) {
        event.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId, editorRef, onCloseTab, onNewTab, onOpenFind, onRedo, onSave, onToggleSyncScroll, onUndo]);
}
