import { DEFAULT_GLOBAL_STATE, STORAGE_KEYS } from "./constants";
import type { GlobalState, MarkdownTab } from "../types";

const hasLocalStorage = () => typeof window !== "undefined" && "localStorage" in window;

export function safeRead<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function safeWrite<T>(key: string, value: T) {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota should never break editing.
  }
}

export function loadGlobalState(): GlobalState {
  const state = safeRead<Partial<GlobalState>>(STORAGE_KEYS.global, {});
  const language = normalizeLanguage(window.localStorage.getItem(STORAGE_KEYS.language) || state.language || detectLanguage());
  const findDocked = window.localStorage.getItem(STORAGE_KEYS.findDocked);
  return {
    ...DEFAULT_GLOBAL_STATE,
    ...state,
    language,
    findDocked: findDocked ? findDocked === "1" : Boolean(state.findDocked),
  };
}

export function saveGlobalState(state: GlobalState) {
  safeWrite(STORAGE_KEYS.global, state);
  window.localStorage.setItem(STORAGE_KEYS.language, state.language);
  window.localStorage.setItem(STORAGE_KEYS.findDocked, state.findDocked ? "1" : "0");
}

export function loadTabs(): MarkdownTab[] {
  const tabs = safeRead<MarkdownTab[]>(STORAGE_KEYS.tabs, []);
  return tabs
    .filter((tab) => tab && typeof tab.content === "string")
    .slice(0, 20)
    .map((tab) => ({
      ...tab,
      history: tab.history?.length ? tab.history.slice(-80) : [tab.content],
      historyIndex: Number.isFinite(tab.historyIndex) ? tab.historyIndex : 0,
    }));
}

export function saveTabs(tabs: MarkdownTab[]) {
  safeWrite(STORAGE_KEYS.tabs, tabs.slice(0, 20));
}

export function loadActiveTabId() {
  return hasLocalStorage() ? window.localStorage.getItem(STORAGE_KEYS.activeTab) : null;
}

export function saveActiveTabId(id: string) {
  if (hasLocalStorage()) window.localStorage.setItem(STORAGE_KEYS.activeTab, id);
}

export function loadUntitledCounter() {
  const raw = hasLocalStorage() ? window.localStorage.getItem(STORAGE_KEYS.untitledCounter) : null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function saveUntitledCounter(value: number) {
  if (hasLocalStorage()) window.localStorage.setItem(STORAGE_KEYS.untitledCounter, String(value));
}

export function makeTab(title: string, content: string): MarkdownTab {
  const now = Date.now();
  return {
    id: `tab-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content,
    createdAt: now,
    updatedAt: now,
    history: [content],
    historyIndex: 0,
  };
}

export async function loadDefaultMarkdown() {
  try {
    const response = await fetch("/sample.md", { cache: "force-cache" });
    if (response.ok) return await response.text();
  } catch {
    // Fall through to embedded starter document.
  }
  return `# MD Preview\n\nA React rewrite of Markdown Viewer with live preview, diagrams, math, import/export, search, and offline-first persistence.\n\n\`\`\`mermaid\nflowchart LR\n  A[Write] --> B[Preview]\n  B --> C[Export]\n\`\`\`\n\nInline math $E=mc^2$ and display math:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n`;
}

function detectLanguage() {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("lang");
  if (explicit) return normalizeLanguage(explicit);
  const hash = window.location.hash;
  if (hash.includes("?")) {
    const hashParams = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
    const hashLang = hashParams.get("lang");
    if (hashLang) return normalizeLanguage(hashLang);
  }
  return normalizeLanguage(navigator.language || "en");
}

function normalizeLanguage(value: string) {
  const lower = value.toLowerCase();
  if (lower.startsWith("zh-tw") || lower.startsWith("zh-hant") || lower === "tw") return "tw";
  if (lower.startsWith("zh")) return "zh";
  const base = lower.split("-")[0];
  return ["en", "ja", "ko", "es", "fr", "de"].includes(base) ? base : "en";
}
