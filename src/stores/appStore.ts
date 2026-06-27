import { create } from "zustand";
import { MAX_TABS } from "../lib/constants";
import { readShareFromLocation } from "../lib/share";
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
} from "../lib/storage";
import type { GlobalState, MarkdownTab } from "../types";

interface AppStoreState {
  initialized: boolean;
  globalState: GlobalState;
  tabs: MarkdownTab[];
  activeTabId: string;
  untitledCounter: number;
  initializeWorkspace: () => Promise<void>;
  updateGlobal: (patch: Partial<GlobalState>) => void;
  setActiveTabId: (id: string) => void;
  updateActiveContent: (content: string, commitHistory?: boolean) => void;
  addTab: (content?: string, title?: string) => MarkdownTab | null;
  addTabs: (tabs: MarkdownTab[], activeId?: string) => void;
  closeTab: (id: string, fallbackTitle: string) => void;
  renameTab: (id: string, title: string) => void;
  duplicateTab: (id: string) => MarkdownTab | null;
  reorderTab: (draggedId: string, targetId: string) => void;
  undo: () => void;
  redo: () => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  initialized: false,
  globalState: loadGlobalState(),
  tabs: [],
  activeTabId: "",
  untitledCounter: loadUntitledCounter(),

  async initializeWorkspace() {
    if (get().initialized) return;
    const shared = readShareFromLocation();
    const storedTabs = loadTabs();
    const defaultMarkdown = await loadDefaultMarkdown();
    const untitledCounter = loadUntitledCounter();
    let tabs: MarkdownTab[];
    let activeTabId: string;

    if (shared) {
      const tab = makeTab(shared.editable ? "Shared edit" : "Shared view", shared.markdown);
      const globalState: GlobalState = { ...get().globalState, viewMode: shared.editable ? "split" : "preview" };
      tabs = [tab];
      activeTabId = tab.id;
      saveGlobalState(globalState);
      set({ globalState });
    } else if (storedTabs.length) {
      const storedActive = loadActiveTabId();
      tabs = storedTabs;
      activeTabId = storedActive && storedTabs.some((tab) => tab.id === storedActive) ? storedActive : storedTabs[0].id;
    } else {
      const tab = makeTab("Welcome.md", defaultMarkdown);
      tabs = [tab];
      activeTabId = tab.id;
    }

    set({ initialized: true, tabs, activeTabId, untitledCounter });
    persistTabs(tabs, activeTabId, untitledCounter);
  },

  updateGlobal(patch) {
    set((state) => {
      const globalState = { ...state.globalState, ...patch };
      saveGlobalState(globalState);
      return { globalState };
    });
  },

  setActiveTabId(id) {
    set({ activeTabId: id });
    saveActiveTabId(id);
  },

  updateActiveContent(content, commitHistory = false) {
    const { activeTabId, untitledCounter } = get();
    set((state) => {
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        let history = tab.history;
        let historyIndex = tab.historyIndex;
        if (commitHistory && content !== tab.history[tab.historyIndex]) {
          history = tab.history.slice(0, tab.historyIndex + 1).concat(content).slice(-80);
          historyIndex = history.length - 1;
        }
        return { ...tab, content, updatedAt: Date.now(), history, historyIndex };
      });
      persistTabs(tabs, state.activeTabId, untitledCounter);
      return { tabs };
    });
  },

  addTab(content = "", title) {
    const state = get();
    if (state.tabs.length >= MAX_TABS) return null;
    const tab = makeTab(title || nextUntitledTitle(state.tabs), content);
    const tabs = [...state.tabs, tab];
    const nextCounter = nextUntitledIndex(tabs);
    set({ tabs, activeTabId: tab.id, untitledCounter: nextCounter });
    persistTabs(tabs, tab.id, nextCounter);
    return tab;
  },

  addTabs(importedTabs, activeId) {
    if (!importedTabs.length) return;
    const state = get();
    const tabs = [...state.tabs, ...importedTabs].slice(0, MAX_TABS);
    const activeTabId = activeId || importedTabs[0].id;
    set({ tabs, activeTabId });
    persistTabs(tabs, activeTabId, state.untitledCounter);
  },

  closeTab(id, _fallbackTitle) {
    const state = get();
    if (state.tabs.length <= 1) {
      const tab = makeTab(nextUntitledTitle([]), "");
      const untitledCounter = nextUntitledIndex([tab]);
      set({ tabs: [tab], activeTabId: tab.id, untitledCounter });
      persistTabs([tab], tab.id, untitledCounter);
      return;
    }

    const index = state.tabs.findIndex((tab) => tab.id === id);
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    const activeTabId = id === state.activeTabId ? tabs[Math.max(0, index - 1)]?.id || tabs[0].id : state.activeTabId;
    set({ tabs, activeTabId });
    persistTabs(tabs, activeTabId, state.untitledCounter);
  },

  renameTab(id, title) {
    const state = get();
    const tabs = state.tabs.map((tab) => (tab.id === id ? { ...tab, title, updatedAt: Date.now() } : tab));
    set({ tabs });
    persistTabs(tabs, state.activeTabId, state.untitledCounter);
  },

  duplicateTab(id) {
    const tab = get().tabs.find((item) => item.id === id);
    if (!tab) return null;
    return get().addTab(tab.content, `${tab.title.replace(/\.md$/i, "")} copy.md`);
  },

  reorderTab(draggedId, targetId) {
    if (draggedId === targetId) return;
    const state = get();
    const from = state.tabs.findIndex((tab) => tab.id === draggedId);
    const to = state.tabs.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0) return;
    const tabs = [...state.tabs];
    const [dragged] = tabs.splice(from, 1);
    tabs.splice(to, 0, dragged);
    set({ tabs });
    persistTabs(tabs, state.activeTabId, state.untitledCounter);
  },

  undo() {
    const state = get();
    const tabs = state.tabs.map((tab) => {
      if (tab.id !== state.activeTabId || tab.historyIndex <= 0) return tab;
      const historyIndex = tab.historyIndex - 1;
      return { ...tab, historyIndex, content: tab.history[historyIndex], updatedAt: Date.now() };
    });
    set({ tabs });
    persistTabs(tabs, state.activeTabId, state.untitledCounter);
  },

  redo() {
    const state = get();
    const tabs = state.tabs.map((tab) => {
      if (tab.id !== state.activeTabId || tab.historyIndex >= tab.history.length - 1) return tab;
      const historyIndex = tab.historyIndex + 1;
      return { ...tab, historyIndex, content: tab.history[historyIndex], updatedAt: Date.now() };
    });
    set({ tabs });
    persistTabs(tabs, state.activeTabId, state.untitledCounter);
  },
}));

function persistTabs(tabs: MarkdownTab[], activeTabId: string, untitledCounter: number) {
  if (tabs.length) saveTabs(tabs);
  if (activeTabId) saveActiveTabId(activeTabId);
  saveUntitledCounter(untitledCounter);
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
