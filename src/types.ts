export type ViewMode = "split" | "editor" | "preview";
export type ThemeMode = "light" | "dark";

export interface MarkdownTab {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  fileHandleName?: string;
  history: string[];
  historyIndex: number;
}

export interface GlobalState {
  theme: ThemeMode;
  viewMode: ViewMode;
  syncScroll: boolean;
  splitPercent: number;
  language: string;
  direction: "ltr" | "rtl";
  offlineFirst: boolean;
  findDocked: boolean;
}

export interface RenderBlock {
  id: string;
  html: string;
  hash: string;
  startLine: number;
  endLine: number;
}

export interface RenderResult {
  mode: "full" | "segmented";
  html?: string;
  blocks?: RenderBlock[];
  toc: TocEntry[];
  frontmatter?: Record<string, unknown>;
  warnings: string[];
}

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export interface FindOptions {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  inSelection: boolean;
  preserveCase: boolean;
  scope: FindScope;
}

export interface FindMatch {
  start: number;
  end: number;
  text: string;
}

export type FindScope = "document" | "selection" | "heading" | "code" | "prose";

export interface GitHubMarkdownFile {
  path: string;
  name: string;
  downloadUrl: string;
  size: number;
}
