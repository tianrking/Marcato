import { DEFAULT_GLOBAL_STATE, STORAGE_KEYS } from "./constants";
import { reconcileHistory } from "./editHistory";
import { normalizeWechatStyle } from "./wechatStyles";
import type { GlobalState, MarkdownTab } from "../types";

export const WORKSPACE_STORAGE_FAILURE_EVENT = "marcato:workspace-storage-failure";

let workspaceStorageFailureActive = false;
let workspaceStorageFailureTimer: number | null = null;

const hasLocalStorage = () => {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

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
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage quota should never break editing.
    return false;
  }
}

function safeReadString(key: string) {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteString(key: string, value: string) {
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function notifyWorkspaceStorageFailure() {
  if (workspaceStorageFailureActive) return;
  workspaceStorageFailureActive = true;
  if (typeof window !== "undefined") {
    workspaceStorageFailureTimer = window.setTimeout(() => {
      workspaceStorageFailureTimer = null;
      if (!workspaceStorageFailureActive) return;
      window.dispatchEvent(new Event(WORKSPACE_STORAGE_FAILURE_EVENT));
    }, 0);
  }
}

export function markWorkspaceStorageAvailable() {
  workspaceStorageFailureActive = false;
  if (workspaceStorageFailureTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(workspaceStorageFailureTimer);
    workspaceStorageFailureTimer = null;
  }
}

export function loadGlobalState(): GlobalState {
  const state = safeRead<Partial<GlobalState>>(STORAGE_KEYS.global, {});
  const language = normalizeLanguage(safeReadString(STORAGE_KEYS.language) || state.language || detectLanguage());
  const findDocked = safeReadString(STORAGE_KEYS.findDocked);
  return {
    ...DEFAULT_GLOBAL_STATE,
    ...state,
    accent: normalizeAccent(state.accent),
    easterEggs: typeof state.easterEggs === "boolean" ? state.easterEggs : DEFAULT_GLOBAL_STATE.easterEggs,
    professionalProfile: normalizeProfessionalProfile(state.professionalProfile),
    wechatStyle: normalizeWechatStyle(state.wechatStyle),
    language,
    findDocked: findDocked ? findDocked === "1" : Boolean(state.findDocked),
  };
}

export function saveGlobalState(state: GlobalState) {
  const globalSaved = safeWrite(STORAGE_KEYS.global, state);
  const languageSaved = safeWriteString(STORAGE_KEYS.language, state.language);
  const findDockedSaved = safeWriteString(STORAGE_KEYS.findDocked, state.findDocked ? "1" : "0");
  return globalSaved && languageSaved && findDockedSaved;
}

export function loadTabs(): MarkdownTab[] {
  const tabs = safeRead<MarkdownTab[]>(STORAGE_KEYS.tabs, []);
  return tabs
    .filter((tab) => tab && typeof tab.content === "string")
    .slice(0, 20)
    .map((tab) => reconcileHistory({
      ...tab,
      history: Array.isArray(tab.history) ? tab.history : [],
      historyIndex: tab.historyIndex,
    }));
}

export function saveTabs(tabs: MarkdownTab[]) {
  return safeWrite(STORAGE_KEYS.tabs, tabs.slice(0, 20));
}

export function loadActiveTabId() {
  return safeReadString(STORAGE_KEYS.activeTab);
}

export function saveActiveTabId(id: string) {
  return safeWriteString(STORAGE_KEYS.activeTab, id);
}

export function loadUntitledCounter() {
  const raw = safeReadString(STORAGE_KEYS.untitledCounter);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function saveUntitledCounter(value: number) {
  return safeWriteString(STORAGE_KEYS.untitledCounter, String(value));
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
  return `# Marcato\n\nA polished Markdown studio for focused writing, live preview, diagrams, math, import/export, sharing, and offline-first persistence.\n\n\`\`\`mermaid\nflowchart LR\n  A[Write] --> B[Preview]\n  B --> C[Export]\n\`\`\`\n\nInline math $E=mc^2$ and display math:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n`;
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
  return ["en", "ja", "ko", "pt", "es", "fr", "de", "ru", "it", "tr", "pl", "uk"].includes(base) ? base : "en";
}

function normalizeAccent(value: unknown) {
  return ["blue", "teal", "violet", "rose", "amber"].includes(String(value)) ? String(value) as GlobalState["accent"] : DEFAULT_GLOBAL_STATE.accent;
}

function normalizeProfessionalProfile(value: unknown) {
  return ["standard", "wechat", "github", "docusaurus", "vitepress", "mkdocs", "hugo", "jekyll", "astro"].includes(String(value))
    ? String(value) as GlobalState["professionalProfile"]
    : DEFAULT_GLOBAL_STATE.professionalProfile;
}
