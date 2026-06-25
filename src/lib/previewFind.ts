import type { FindOptions } from "../types";

export function applyPreviewFindHighlights(root: HTMLElement, options: FindOptions, activeEditorIndex: number, editorMatchCount: number) {
  clearPreviewFindHighlights(root);
  if (!options.query) return null;
  const pattern = buildPreviewFindPattern(options);
  if (!pattern) return null;

  const nodes = collectSearchableTextNodes(root);
  const highlights: HTMLElement[] = [];
  for (const node of nodes) {
    const text = node.nodeValue || "";
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    while ((match = pattern.exec(text)) !== null) {
      if (!match[0]) {
        pattern.lastIndex += 1;
        continue;
      }
      const before = text.slice(lastIndex, match.index);
      if (before) fragment.appendChild(document.createTextNode(before));
      const mark = document.createElement("mark");
      mark.className = "preview-find-highlight";
      mark.textContent = match[0];
      fragment.appendChild(mark);
      highlights.push(mark);
      lastIndex = match.index + match[0].length;
      changed = true;
    }
    if (!changed) continue;
    const after = text.slice(lastIndex);
    if (after) fragment.appendChild(document.createTextNode(after));
    node.replaceWith(fragment);
  }

  if (!highlights.length) return null;
  const activeIndex = editorMatchCount > 0
    ? Math.min(highlights.length - 1, Math.floor((activeEditorIndex / editorMatchCount) * highlights.length))
    : 0;
  const active = highlights[Math.max(0, activeIndex)];
  active.classList.add("active");
  return active;
}

export function clearPreviewFindHighlights(root: HTMLElement) {
  root.querySelectorAll("mark.preview-find-highlight").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ""));
  });
  root.normalize();
}

export function scrollPreviewHighlightIntoView(container: HTMLElement | null, highlight: HTMLElement | null) {
  if (!container || !highlight) return;
  const paneRect = container.getBoundingClientRect();
  const matchRect = highlight.getBoundingClientRect();
  const offset = matchRect.top - paneRect.top - (paneRect.height / 2) + (matchRect.height / 2);
  container.scrollTop += offset;
}

function collectSearchableTextNodes(root: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || !node.nodeValue) continue;
    if (parent.closest("a,button,code,pre,script,style,textarea,mjx-container,.diagram-viewer,.preview-find-highlight")) continue;
    nodes.push(node);
  }
  return nodes;
}

function buildPreviewFindPattern(options: FindOptions) {
  try {
    const source = options.regex ? options.query : escapeRegExp(options.query);
    const bounded = options.wholeWord ? `\\b(?:${source})\\b` : source;
    return new RegExp(bounded, options.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
