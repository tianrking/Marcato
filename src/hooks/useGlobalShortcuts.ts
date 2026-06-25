import { useEffect, useRef, type RefObject } from "react";

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
  const latestOptionsRef = useRef<GlobalShortcutOptions>({
    activeTabId,
    editorRef,
    onCloseTab,
    onNewTab,
    onOpenFind,
    onRedo,
    onSave,
    onToggleSyncScroll,
    onUndo,
  });

  latestOptionsRef.current = {
    activeTabId,
    editorRef,
    onCloseTab,
    onNewTab,
    onOpenFind,
    onRedo,
    onSave,
    onToggleSyncScroll,
    onUndo,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const options = latestOptionsRef.current;
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod && !(event.altKey && event.shiftKey)) return;

      const key = event.key.toLowerCase();
      if (mod && key === "s" && !event.shiftKey) {
        event.preventDefault();
        options.onSave();
      }
      if (mod && (key === "f" || key === "h")) {
        event.preventDefault();
        options.onOpenFind();
      }
      if (!mod && event.altKey && event.shiftKey && key === "t") {
        event.preventDefault();
        options.onNewTab();
      }
      if (!mod && event.altKey && event.shiftKey && key === "w") {
        event.preventDefault();
        options.onCloseTab(options.activeTabId);
      }
      if (mod && event.shiftKey && key === "s") {
        event.preventDefault();
        options.onToggleSyncScroll();
      }
      if (mod && key === "z" && options.editorRef.current === document.activeElement) {
        event.preventDefault();
        if (event.shiftKey) options.onRedo();
        else options.onUndo();
      }
      if (mod && key === "y" && options.editorRef.current === document.activeElement) {
        event.preventDefault();
        options.onRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
