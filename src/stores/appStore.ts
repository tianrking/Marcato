import { create } from "zustand";
import { MAX_TABS } from "../lib/constants";
import { recordEdit, redoEdit, undoEdit, type EditHistoryBatch } from "../lib/editHistory";
import { readShareFromLocation } from "../lib/share";
import {
  loadActiveTabId,
  loadDefaultMarkdown,
  loadGlobalState,
  loadTabs,
  loadUntitledCounter,
  makeTab,
  markWorkspaceStorageAvailable,
  notifyWorkspaceStorageFailure,
  saveActiveTabId,
  saveGlobalState,
  saveTabs,
  saveUntitledCounter,
} from "../lib/storage";
import type { GlobalState, MarkdownTab } from "../types";

const initialShare = readShareFromLocation();
const initialShareMode: AppStoreState["shareMode"] = initialShare ? (initialShare.editable ? "edit" : "view") : null;

interface AppStoreState {
  initialized: boolean;
  initializing: boolean;
  shareMode: "view" | "edit" | null;
  globalState: GlobalState;
  tabs: MarkdownTab[];
  activeTabId: string;
  untitledCounter: number;
  initializeWorkspace: () => Promise<void>;
  updateGlobal: (patch: Partial<GlobalState>) => void;
  setActiveTabId: (id: string) => void;
  updateActiveContent: (content: string, commitHistory?: boolean, inputType?: string) => void;
  addTab: (content?: string, title?: string) => MarkdownTab | null;
  addTabs: (tabs: MarkdownTab[], activeId?: string) => void;
  closeTab: (id: string, fallbackTitle: string) => void;
  renameTab: (id: string, title: string) => void;
  duplicateTab: (id: string) => MarkdownTab | null;
  reorderTab: (draggedId: string, targetId: string) => void;
  undo: () => void;
  redo: () => void;
}

export const useAppStore = create<AppStoreState>((set, get) => {
  const editBatches = new Map<string, EditHistoryBatch>();

  const clearEditBatch = (tabId?: string) => {
    if (tabId) editBatches.delete(tabId);
    else editBatches.clear();
  };

  return {
    initialized: false,
    initializing: false,
    shareMode: initialShareMode,
    globalState: loadGlobalState(),
    tabs: [],
    activeTabId: "",
    untitledCounter: loadUntitledCounter(),

  async initializeWorkspace() {
    if (get().initialized || get().initializing) return;
    set({ initializing: true });
    const shared = initialShare;
    const storedTabs = loadTabs();
    const untitledCounter = loadUntitledCounter();
    let tabs: MarkdownTab[];
    let activeTabId: string;

    if (shared) {
      const tab = makeTab(shared.editable ? "Shared edit" : "Shared view", shared.markdown);
      const globalState: GlobalState = { ...get().globalState, viewMode: shared.editable ? "split" : "preview" };
      tabs = [tab];
      activeTabId = tab.id;
      set({ globalState });
    } else if (storedTabs.length) {
      const storedActive = loadActiveTabId();
      tabs = storedTabs;
      activeTabId = storedActive && storedTabs.some((tab) => tab.id === storedActive) ? storedActive : storedTabs[0].id;
    } else {
      const defaultMarkdown = await loadDefaultMarkdown();
      const tab = makeTab("Welcome.md", defaultMarkdown);
      tabs = [tab];
      activeTabId = tab.id;
    }

    const shareMode = shared ? (shared.editable ? "edit" : "view") : null;
    set({ initialized: true, initializing: false, shareMode, tabs, activeTabId, untitledCounter });
    persistWorkspace(tabs, activeTabId, untitledCounter, shareMode);
  },

  updateGlobal(patch) {
    set((state) => {
      const safePatch = state.shareMode === "view" && patch.viewMode
        ? { ...patch, viewMode: "preview" as const }
        : patch;
      const globalState = { ...state.globalState, ...safePatch };
      if (!state.shareMode && !saveGlobalState(globalState)) notifyWorkspaceStorageFailure();
      return { globalState };
    });
  },

  setActiveTabId(id) {
    if (id !== get().activeTabId) clearEditBatch();
    set({ activeTabId: id });
    if (!get().shareMode && !saveActiveTabId(id)) notifyWorkspaceStorageFailure();
  },

  updateActiveContent(content, commitHistory = false, inputType) {
    if (get().shareMode === "view") return;
    const { activeTabId, untitledCounter } = get();
    set((state) => {
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        const result = recordEdit(tab, content, {
          batch: editBatches.get(tab.id),
          inputType,
          mode: commitHistory ? "commit" : "input",
        });
        if (result.state === tab) return tab;
        if (result.batch) editBatches.set(tab.id, result.batch);
        else clearEditBatch(tab.id);
        return { ...result.state, updatedAt: Date.now() };
      });
      if (tabs.every((tab, index) => tab === state.tabs[index])) return state;
      persistWorkspace(tabs, state.activeTabId, untitledCounter, state.shareMode);
      return { tabs };
    });
  },

  addTab(content = "", title) {
    const state = get();
    if (state.shareMode === "view") return null;
    if (state.tabs.length >= MAX_TABS) return null;
    const tab = makeTab(title || nextUntitledTitle(state.tabs), content);
    const tabs = [...state.tabs, tab];
    const nextCounter = nextUntitledIndex(tabs);
    clearEditBatch();
    set({ tabs, activeTabId: tab.id, untitledCounter: nextCounter });
    persistWorkspace(tabs, tab.id, nextCounter, state.shareMode);
    return tab;
  },

  addTabs(importedTabs, activeId) {
    if (!importedTabs.length) return;
    const state = get();
    if (state.shareMode === "view") return;
    const tabs = [...state.tabs, ...importedTabs].slice(0, MAX_TABS);
    const activeTabId = activeId || importedTabs[0].id;
    clearEditBatch();
    set({ tabs, activeTabId });
    persistWorkspace(tabs, activeTabId, state.untitledCounter, state.shareMode);
  },

  closeTab(id, _fallbackTitle) {
    const state = get();
    if (state.shareMode === "view") return;
    if (state.tabs.length <= 1) {
      clearEditBatch();
      const tab = makeTab(nextUntitledTitle([]), "");
      const untitledCounter = nextUntitledIndex([tab]);
      set({ tabs: [tab], activeTabId: tab.id, untitledCounter });
      persistWorkspace([tab], tab.id, untitledCounter, state.shareMode);
      return;
    }

    const index = state.tabs.findIndex((tab) => tab.id === id);
    clearEditBatch();
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    const activeTabId = id === state.activeTabId ? tabs[Math.max(0, index - 1)]?.id || tabs[0].id : state.activeTabId;
    set({ tabs, activeTabId });
    persistWorkspace(tabs, activeTabId, state.untitledCounter, state.shareMode);
  },

  renameTab(id, title) {
    const state = get();
    if (state.shareMode === "view") return;
    const tabs = state.tabs.map((tab) => (tab.id === id ? { ...tab, title, updatedAt: Date.now() } : tab));
    set({ tabs });
    persistWorkspace(tabs, state.activeTabId, state.untitledCounter, state.shareMode);
  },

  duplicateTab(id) {
    if (get().shareMode === "view") return null;
    const tab = get().tabs.find((item) => item.id === id);
    if (!tab) return null;
    return get().addTab(tab.content, `${tab.title.replace(/\.md$/i, "")} copy.md`);
  },

  reorderTab(draggedId, targetId) {
    if (draggedId === targetId) return;
    const state = get();
    if (state.shareMode === "view") return;
    const from = state.tabs.findIndex((tab) => tab.id === draggedId);
    const to = state.tabs.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0) return;
    const tabs = [...state.tabs];
    const [dragged] = tabs.splice(from, 1);
    tabs.splice(to, 0, dragged);
    set({ tabs });
    persistWorkspace(tabs, state.activeTabId, state.untitledCounter, state.shareMode);
  },

  undo() {
    const state = get();
    if (state.shareMode === "view") return;
    const tabs = state.tabs.map((tab) => {
      if (tab.id !== state.activeTabId) return tab;
      clearEditBatch(tab.id);
      const next = undoEdit(tab);
      return next === tab ? tab : { ...next, updatedAt: Date.now() };
    });
    set({ tabs });
    persistWorkspace(tabs, state.activeTabId, state.untitledCounter, state.shareMode);
  },

  redo() {
    const state = get();
    if (state.shareMode === "view") return;
    const tabs = state.tabs.map((tab) => {
      if (tab.id !== state.activeTabId) return tab;
      clearEditBatch(tab.id);
      const next = redoEdit(tab);
      return next === tab ? tab : { ...next, updatedAt: Date.now() };
    });
    set({ tabs });
    persistWorkspace(tabs, state.activeTabId, state.untitledCounter, state.shareMode);
  },
  };
});

function persistWorkspace(tabs: MarkdownTab[], activeTabId: string, untitledCounter: number, shareMode: AppStoreState["shareMode"]) {
  if (shareMode) return;
  const tabsSaved = tabs.length === 0 || saveTabs(tabs);
  const activeTabSaved = !activeTabId || saveActiveTabId(activeTabId);
  const counterSaved = saveUntitledCounter(untitledCounter);
  if (tabsSaved && activeTabSaved && counterSaved) markWorkspaceStorageAvailable();
  else notifyWorkspaceStorageFailure();
}

function nextUntitledTitle(tabs: MarkdownTab[]) {
  return `Untitled-${nextUntitledIndex(tabs)}.md`;
}

function nextUntitledIndex(tabs: MarkdownTab[]) {
  const used = new Set<number>();
  for (const tab of tabs) {
    const match = /^Untitled-(\d+)\.md$/i.exec(tab.title.trim());
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) used.add(value);
  }
  let index = 1;
  while (used.has(index)) index += 1;
  return index;
}
