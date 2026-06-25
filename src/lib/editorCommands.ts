export type MarkdownCommand =
  | "bold"
  | "italic"
  | "strike"
  | "quote"
  | "inlineCode"
  | "codeBlock"
  | "terminal"
  | "h1"
  | "h2"
  | "h3"
  | "ul"
  | "ol"
  | "task"
  | "hr"
  | "table"
  | "link"
  | "image"
  | "reference"
  | "alert"
  | "mermaid"
  | "math"
  | "date"
  | "upper"
  | "lower"
  | "clear";

export interface CommandResult {
  value: string;
  start: number;
  end: number;
}

export function applyCommand(value: string, command: MarkdownCommand, start: number, end: number): CommandResult {
  const selected = value.slice(start, end);
  const lineRange = getLineRange(value, start, end);
  const lineText = value.slice(lineRange.start, lineRange.end);

  switch (command) {
    case "bold":
      return wrap(value, start, end, "**", "**", "bold text");
    case "italic":
      return wrap(value, start, end, "_", "_", "italic text");
    case "strike":
      return wrap(value, start, end, "~~", "~~", "deleted text");
    case "inlineCode":
      return wrap(value, start, end, "`", "`", "code");
    case "quote":
      return replaceRange(value, lineRange.start, lineRange.end, prefixLines(lineText || selected || "quote", "> "));
    case "h1":
    case "h2":
    case "h3": {
      const level = Number(command.slice(1));
      const clean = lineText.replace(/^#{1,6}\s*/, "") || "Heading";
      return replaceRange(value, lineRange.start, lineRange.end, `${"#".repeat(level)} ${clean}`);
    }
    case "ul":
      return replaceRange(value, lineRange.start, lineRange.end, prefixLines(stripListMarkers(lineText || selected || "List item"), "- "));
    case "ol":
      return replaceRange(value, lineRange.start, lineRange.end, numberedLines(stripListMarkers(lineText || selected || "List item")));
    case "task":
      return replaceRange(value, lineRange.start, lineRange.end, prefixLines(stripListMarkers(lineText || selected || "Task item"), "- [ ] "));
    case "hr":
      return insertBlock(value, start, "\n---\n");
    case "codeBlock":
      return wrapBlock(value, start, end, "```\n", "\n```", selected || "code");
    case "terminal":
      return wrapBlock(value, start, end, "```bash\n", "\n```", selected || "npm run build");
    case "table":
      return insertBlock(value, start, "\n| Column A | Column B | Column C |\n| --- | --- | --- |\n| Value | Value | Value |\n");
    case "link":
      return replaceRange(value, start, end, `[${selected || "link text"}](https://example.com)`);
    case "image":
      return replaceRange(value, start, end, `![${selected || "image alt"}](https://example.com/image.png)`);
    case "reference":
      return insertBlock(value, end, `\n\n[${selected || "Reference"}]: https://example.com\n`);
    case "alert":
      return insertBlock(value, start, `\n> [!NOTE]\n> ${selected || "Important note"}\n`);
    case "mermaid":
      return insertBlock(value, start, "\n```mermaid\nflowchart LR\n  A[Start] --> B[Preview]\n```\n");
    case "math":
      return insertBlock(value, start, "\n$$\nE = mc^2\n$$\n");
    case "date":
      return replaceRange(value, start, end, new Date().toISOString().slice(0, 10));
    case "upper":
      return replaceRange(value, start, end, selected.toUpperCase());
    case "lower":
      return replaceRange(value, start, end, selected.toLowerCase());
    case "clear":
      return replaceRange(value, start, end, stripMarkdownFormatting(selected || lineText));
    default:
      return { value, start, end };
  }
}

export function handleSmartEnter(value: string, cursor: number): CommandResult | null {
  const range = getLineRange(value, cursor, cursor);
  const line = value.slice(range.start, cursor);
  const task = /^(\s*)[-*+]\s+\[[ xX]\]\s+/.exec(line);
  if (task) return insertText(value, cursor, `\n${task[1]}- [ ] `);
  const unordered = /^(\s*)[-*+]\s+/.exec(line);
  if (unordered) return insertText(value, cursor, `\n${unordered[1]}- `);
  const ordered = /^(\s*)(\d+)\.\s+/.exec(line);
  if (ordered) return insertText(value, cursor, `\n${ordered[1]}${Number(ordered[2]) + 1}. `);
  const quote = /^(\s*>\s*)/.exec(line);
  if (quote) return insertText(value, cursor, `\n${quote[1]}`);
  return null;
}

export function insertText(value: string, at: number, text: string): CommandResult {
  return {
    value: value.slice(0, at) + text + value.slice(at),
    start: at + text.length,
    end: at + text.length,
  };
}

export type TableAlignment = "default" | "left" | "center" | "right";

export function buildMarkdownTable(columns: number, rows: number, alignment: TableAlignment) {
  const safeColumns = Math.min(20, Math.max(1, Math.floor(columns)));
  const safeRows = Math.min(50, Math.max(1, Math.floor(rows)));
  const headers = Array.from({ length: safeColumns }, (_item, index) => `Column ${index + 1}`);
  const divider = Array.from({ length: safeColumns }, () => tableDivider(alignment));
  const body = Array.from({ length: safeRows }, (_row, rowIndex) =>
    Array.from({ length: safeColumns }, (_cell, columnIndex) => `Cell ${rowIndex + 1}.${columnIndex + 1}`),
  );
  return [
    "",
    markdownTableRow(headers),
    markdownTableRow(divider),
    ...body.map(markdownTableRow),
    "",
  ].join("\n");
}

export function buildMarkdownLink(label: string, url: string) {
  const safeLabel = (label.trim() || "link text").replace(/\]/g, "\\]");
  const safeUrl = (url.trim() || "https://example.com").replace(/\)/g, "%29");
  return `[${safeLabel}](${safeUrl})`;
}

export function buildMarkdownImage(alt: string, source: string) {
  const safeAlt = (alt.trim() || "image alt").replace(/\]/g, "\\]");
  const safeSource = (source.trim() || "https://example.com/image.png").replace(/\)/g, "%29");
  return `![${safeAlt}](${safeSource})`;
}

function tableDivider(alignment: TableAlignment) {
  if (alignment === "left") return ":---";
  if (alignment === "center") return ":---:";
  if (alignment === "right") return "---:";
  return "---";
}

function markdownTableRow(cells: string[]) {
  return `| ${cells.join(" | ")} |`;
}

function wrap(value: string, start: number, end: number, before: string, after: string, placeholder: string) {
  const selected = value.slice(start, end) || placeholder;
  const replacement = `${before}${selected}${after}`;
  return replaceRange(value, start, end, replacement, start + before.length, start + before.length + selected.length);
}

function wrapBlock(value: string, start: number, end: number, before: string, after: string, placeholder: string) {
  const selected = value.slice(start, end) || placeholder;
  const replacement = `${before}${selected}${after}`;
  return replaceRange(value, start, end, replacement, start + before.length, start + before.length + selected.length);
}

function insertBlock(value: string, at: number, block: string) {
  const needsBefore = at > 0 && value[at - 1] !== "\n";
  const needsAfter = at < value.length && value[at] !== "\n";
  const text = `${needsBefore ? "\n" : ""}${block}${needsAfter ? "\n" : ""}`;
  return insertText(value, at, text);
}

function replaceRange(value: string, start: number, end: number, replacement: string, nextStart?: number, nextEnd?: number): CommandResult {
  return {
    value: value.slice(0, start) + replacement + value.slice(end),
    start: nextStart ?? start + replacement.length,
    end: nextEnd ?? start + replacement.length,
  };
}

function getLineRange(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextBreak = value.indexOf("\n", end);
  return { start: lineStart, end: nextBreak === -1 ? value.length : nextBreak };
}

function prefixLines(text: string, prefix: string) {
  return text
    .split("\n")
    .map((line) => `${prefix}${line.replace(/^(\s*)(?:[-*+]|\d+\.)\s+/, "$1")}`)
    .join("\n");
}

function numberedLines(text: string) {
  return text
    .split("\n")
    .map((line, index) => `${index + 1}. ${line.replace(/^(\s*)(?:[-*+]|\d+\.)\s+/, "$1").trimStart()}`)
    .join("\n");
}

function stripListMarkers(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ""))
    .join("\n");
}

export function stripMarkdownFormatting(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#-]/g, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .trim();
}
