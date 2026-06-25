import type { FindMatch, FindOptions } from "../types";

export function findMatches(text: string, options: FindOptions, selection?: { start: number; end: number }): FindMatch[] {
  if (!options.query) return [];
  const pattern = buildPattern(options);
  if (!pattern) return [];
  const matches: FindMatch[] = [];
  for (const range of getFindScopeRanges(text, options, selection)) {
    const scopeText = text.slice(range.start, range.end);
    pattern.lastIndex = 0;
    for (const match of scopeText.matchAll(pattern)) {
      const value = match[0];
      const index = match.index ?? 0;
      if (!value) continue;
      matches.push({ start: range.start + index, end: range.start + index + value.length, text: value });
      if (matches.length > 10_000) break;
    }
    if (matches.length > 10_000) break;
  }
  return matches;
}

export function getFindScopeRanges(text: string, options: FindOptions, selection?: { start: number; end: number }) {
  const scope = options.inSelection ? "selection" : options.scope;
  if (scope === "selection") return selection && selection.end > selection.start ? [selection] : [];
  if (scope === "heading") return [getHeadingRange(text, selection?.start ?? 0)];
  if (scope === "code") return getFencedCodeRanges(text);
  if (scope === "prose") return invertRanges(text.length, getFencedCodeRanges(text));
  return [{ start: 0, end: text.length }];
}

export function replaceOne(text: string, match: FindMatch, options: FindOptions) {
  const replacement = applyReplacementCase(match.text, options.replacement, options.preserveCase);
  return text.slice(0, match.start) + replacement + text.slice(match.end);
}

export function replaceAll(text: string, matches: FindMatch[], options: FindOptions) {
  let offset = 0;
  let result = text;
  for (const match of matches) {
    const adjusted = { start: match.start + offset, end: match.end + offset, text: match.text };
    const replacement = applyReplacementCase(match.text, options.replacement, options.preserveCase);
    result = result.slice(0, adjusted.start) + replacement + result.slice(adjusted.end);
    offset += replacement.length - match.text.length;
  }
  return result;
}

export function buildDiffPreview(text: string, matches: FindMatch[], options: FindOptions) {
  if (matches.length === 0) return [];
  return matches.slice(0, 6).map((match, index) => {
    const before = text.slice(Math.max(0, match.start - 72), match.start);
    const current = text.slice(match.start, match.end);
    const after = text.slice(match.end, Math.min(text.length, match.end + 72));
    const replacement = applyReplacementCase(current, options.replacement, options.preserveCase);
    return {
      after,
      before,
      index: index + 1,
      replacement,
      text: current,
    };
  });
}

function buildPattern(options: FindOptions) {
  try {
    const source = options.regex ? options.query : escapeRegExp(options.query);
    const bounded = options.wholeWord ? `\\b(?:${source})\\b` : source;
    return new RegExp(bounded, options.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

function applyReplacementCase(original: string, replacement: string, preserveCase: boolean) {
  if (!preserveCase || !replacement) return replacement;
  if (original.toUpperCase() === original) return replacement.toUpperCase();
  if (original.toLowerCase() === original) return replacement.toLowerCase();
  if (original[0]?.toUpperCase() === original[0]) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHeadingRange(text: string, cursor: number) {
  const lines = splitLinesWithOffsets(text);
  const currentLineIndex = Math.max(0, lines.findIndex((line) => cursor >= line.start && cursor <= line.end));
  let headingIndex = -1;
  let headingLevel = 0;
  for (let index = currentLineIndex; index >= 0; index -= 1) {
    const match = /^(#{1,6})\s+\S/.exec(lines[index].text);
    if (match) {
      headingIndex = index;
      headingLevel = match[1].length;
      break;
    }
  }
  if (headingIndex < 0) return { start: 0, end: text.length };
  let end = text.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+\S/.exec(lines[index].text);
    if (match && match[1].length <= headingLevel) {
      end = lines[index].start;
      break;
    }
  }
  return { start: lines[headingIndex].start, end };
}

function getFencedCodeRanges(text: string) {
  const lines = splitLinesWithOffsets(text);
  const ranges: Array<{ start: number; end: number }> = [];
  let fence: { marker: string; ticks: number; start: number } | null = null;

  for (const line of lines) {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line.text);
    if (!match) continue;
    const marker = match[1][0];
    const ticks = match[1].length;
    if (!fence) {
      fence = { marker, ticks, start: line.start };
      continue;
    }
    if (marker === fence.marker && ticks >= fence.ticks) {
      ranges.push({ start: fence.start, end: line.endWithBreak });
      fence = null;
    }
  }

  if (fence) ranges.push({ start: fence.start, end: text.length });
  return ranges;
}

function invertRanges(length: number, ranges: Array<{ start: number; end: number }>) {
  const result: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start > cursor) result.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  });
  if (cursor < length) result.push({ start: cursor, end: length });
  return result;
}

function splitLinesWithOffsets(text: string) {
  const lines: string[] = [];
  const breaks: number[] = [];
  const pattern = /\r\n|\n|\r/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    lines.push(text.slice(cursor, match.index));
    breaks.push(match[0].length);
    cursor = match.index + match[0].length;
  }
  lines.push(text.slice(cursor));
  breaks.push(0);
  let offset = 0;
  return lines.map((line, index) => {
    const start = offset;
    const end = start + line.length;
    const endWithBreak = end + breaks[index];
    offset = endWithBreak;
    return { text: line, start, end, endWithBreak };
  });
}
