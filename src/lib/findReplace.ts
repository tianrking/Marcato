import type { FindMatch, FindOptions } from "../types";

export function findMatches(text: string, options: FindOptions, selection?: { start: number; end: number }): FindMatch[] {
  if (!options.query) return [];
  const scopeStart = options.inSelection && selection ? selection.start : 0;
  const scopeText = options.inSelection && selection ? text.slice(selection.start, selection.end) : text;
  const pattern = buildPattern(options);
  if (!pattern) return [];
  const matches: FindMatch[] = [];
  for (const match of scopeText.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (!value) continue;
    matches.push({ start: scopeStart + index, end: scopeStart + index + value.length, text: value });
    if (matches.length > 10_000) break;
  }
  return matches;
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
  if (matches.length === 0) return "";
  const first = matches[0];
  const before = text.slice(Math.max(0, first.start - 80), first.start);
  const current = text.slice(first.start, first.end);
  const after = text.slice(first.end, Math.min(text.length, first.end + 80));
  const replacement = applyReplacementCase(current, options.replacement, options.preserveCase);
  return `${before}[-${current}-][+${replacement}+]${after}`;
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
