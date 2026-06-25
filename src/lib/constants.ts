import type { GlobalState } from "../types";

export const STORAGE_KEYS = {
  tabs: "markdownViewerTabs",
  activeTab: "markdownViewerActiveTab",
  untitledCounter: "markdownViewerUntitledCounter",
  global: "markdownViewerGlobalState",
  language: "app-lang",
  findDocked: "find-replace-docked",
};

export const MAX_TABS = 20;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const SHARE_URL_SOFT_LIMIT = 32_000;

export const DEFAULT_GLOBAL_STATE: GlobalState = {
  theme: "light",
  accent: "blue",
  viewMode: "split",
  syncScroll: true,
  splitPercent: 50,
  language: "en",
  direction: "ltr",
  offlineFirst: true,
  findDocked: false,
};

export const DIAGRAM_LANGUAGES = new Set([
  "mermaid",
  "abc",
  "geojson",
  "topojson",
  "stl",
  "plantuml",
  "d2",
  "graphviz",
  "dot",
  "vega-lite",
  "vegalite",
  "wavedrom",
  "markmap",
]);
