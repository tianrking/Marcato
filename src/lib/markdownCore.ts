import { Marked, Renderer } from "marked";
import hljs from "highlight.js";
import * as yaml from "js-yaml";
import type { RenderBlock, RenderResult, TocEntry } from "../types";
import { DIAGRAM_LANGUAGES } from "./constants";

const BLOCK_MATH_PATTERN = /^\$\$[ \t]*\n?([\s\S]*?)\n?\$\$[ \t]*(?:\n|$)/;
const DEFINITION_LIST_ITEM_PATTERN = /^:[ \t]+(.*)$/;
const SUPERSCRIPT_PATTERN = /^\^(?!\s)([^^\n]*?\S)\^(?!\^)/;
const SUBSCRIPT_PATTERN = /^~(?!~)(?!\s)([^~\n]*?\S)~(?!~)/;
const HIGHLIGHT_PATTERN = /^==(?=\S)([\s\S]*?\S)==/;
const INLINE_MATH_PATTERN = /^\$(?!\s|\$)([\s\S]*?\S)\$(?!\$)/;
const EMPTY_LINE_PATTERN = /^\s*$/;
const MARKDOWN_LIST_MARKER_PATTERN = /^(\s*)(?:[-*+]\s+|\d+\.\s+|>\s+)/;
const GITHUB_ALERT_MARKER_PATTERN = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:(?:\s|&nbsp;|<br\s*\/?>)+|$)/i;

const GITHUB_ALERT_LABELS: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

interface MarkdownContext {
  footnoteDefinitions: Map<string, string>;
  footnoteOrder: string[];
  footnoteRefCounts: Map<string, number>;
  footnoteFirstRefId: Map<string, string>;
  anonymousFootnoteCounter: number;
  suppressFootnotes: boolean;
  toc: TocEntry[];
}

const context: MarkdownContext = {
  footnoteDefinitions: new Map(),
  footnoteOrder: [],
  footnoteRefCounts: new Map(),
  footnoteFirstRefId: new Map(),
  anonymousFootnoteCounter: 0,
  suppressFootnotes: false,
  toc: [],
};

let markedInstance: Marked | null = null;

export function renderMarkdownToHtml(markdown: string, segmented = true): RenderResult {
  const warnings: string[] = [];
  const frontmatterResult = parseFrontmatter(markdown);
  const body = frontmatterResult.body;
  context.toc = [];

  if (segmented && isSegmentedPreviewSafe(body)) {
    const blocks = splitMarkdownBlocks(body);
    if (blocks.length > 1) {
      const seen = new Map<string, number>();
      const rendered = blocks.map((block) => {
        const hash = hashString(block.source);
        const duplicateIndex = seen.get(hash) || 0;
        seen.set(hash, duplicateIndex + 1);
        return {
          id: `preview-block-${hash}-${duplicateIndex}`,
          hash,
          html: renderFullMarkdown(block.source, frontmatterResult.frontmatter, false),
          startLine: block.startLine,
          endLine: block.endLine,
        } satisfies RenderBlock;
      });
      return {
        mode: "segmented",
        blocks: rendered,
        toc: context.toc,
        frontmatter: frontmatterResult.frontmatter,
        warnings,
      };
    }
  }

  return {
    mode: "full",
    html: renderFullMarkdown(body, frontmatterResult.frontmatter, true),
    toc: context.toc,
    frontmatter: frontmatterResult.frontmatter,
    warnings,
  };
}

export function parseFrontmatter(markdown: string): { body: string; frontmatter?: Record<string, unknown> } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) return { body: markdown };
  try {
    const parsed = yaml.load(match[1]);
    return {
      body: normalized.slice(match[0].length),
      frontmatter: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined,
    };
  } catch {
    return { body: markdown };
  }
}

function renderFullMarkdown(markdown: string, frontmatter: Record<string, unknown> | undefined, includeFrontmatter: boolean) {
  const marked = getMarked();
  const rendered = enhanceGitHubAlerts(marked.parse(markdown, { async: false }) as string);
  if (!includeFrontmatter || !frontmatter || Object.keys(frontmatter).length === 0) return rendered;
  const rows = Object.entries(frontmatter)
    .map(([key, value]) => {
      const display = Array.isArray(value) ? value.join(", ") : String(value ?? "");
      return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(display)}</td></tr>`;
    })
    .join("");
  return `<table class="frontmatter-table"><tbody>${rows}</tbody></table>\n${rendered}`;
}

function enhanceGitHubAlerts(html: string) {
  return html.replace(/<blockquote>\s*<p>([\s\S]*?)<\/p>/gi, (_match, firstParagraph: string) => {
    const marker = GITHUB_ALERT_MARKER_PATTERN.exec(firstParagraph);
    if (!marker) return _match;
    const type = marker[1].toLowerCase();
    const remaining = firstParagraph.replace(GITHUB_ALERT_MARKER_PATTERN, "").trim();
    const label = GITHUB_ALERT_LABELS[type] || marker[1];
    const title = `<p class="markdown-alert-title"><span class="markdown-alert-icon" aria-hidden="true"></span><span>${escapeHtml(label)}</span></p>`;
    return `<blockquote class="markdown-alert markdown-alert-${escapeHtmlAttribute(type)}">${title}${remaining ? `<p>${remaining}</p>` : ""}`;
  });
}

function getMarked() {
  if (markedInstance) return markedInstance;
  const marked = new Marked({
    gfm: true,
    breaks: true,
    pedantic: false,
  });
  const renderer = new Renderer() as any;

  renderer.code = (tokenOrCode: any, legacyLanguage?: string) => {
    const code = typeof tokenOrCode === "object" ? tokenOrCode.text || "" : String(tokenOrCode || "");
    const language = String(typeof tokenOrCode === "object" ? tokenOrCode.lang || "" : legacyLanguage || "")
      .trim()
      .toLowerCase();

    if (language === "math") {
      return `<div class="math-block" data-tex="${escapeHtmlAttribute(code)}">$$\n${escapeHtml(code)}\n$$</div>`;
    }

    if (DIAGRAM_LANGUAGES.has(language)) {
      const id = `${language || "diagram"}-${hashString(code)}-${Math.random().toString(36).slice(2, 8)}`;
      const engine = language === "dot" ? "graphviz" : language;
      return `<figure class="diagram-viewer is-loading" data-diagram-engine="${escapeHtmlAttribute(engine)}">` +
        `<figcaption>${escapeHtml(diagramLabel(engine))}</figcaption>` +
        `<div class="diagram-toolbar" aria-label="${escapeHtmlAttribute(diagramLabel(engine))} toolbar"></div>` +
        `<div id="${id}" class="diagram-surface ${escapeHtmlAttribute(engine)}" data-original-code="${encodeURIComponent(code)}">${escapeHtml(code)}</div>` +
        `<div class="diagram-status" role="status">Rendering ${escapeHtml(diagramLabel(engine))}</div>` +
        `</figure>`;
    }

    const validLanguage = language && hljs.getLanguage(language) ? language : "plaintext";
    const highlighted = validLanguage !== "plaintext"
      ? hljs.highlight(code, { language: validLanguage }).value
      : escapeHtml(code);
    return `<pre><code class="hljs language-${escapeHtmlAttribute(validLanguage)}">${highlighted}</code></pre>`;
  };

  renderer.heading = (tokenOrText: any, legacyLevel?: number, legacyRaw?: string) => {
    const text = typeof tokenOrText === "object" ? tokenOrText.text || "" : String(tokenOrText || "");
    const level = Number(typeof tokenOrText === "object" ? tokenOrText.depth || 1 : legacyLevel || 1);
    const raw = typeof tokenOrText === "object" ? tokenOrText.raw || text : legacyRaw || text;
    const id = uniqueSlug(stripHtml(raw));
    context.toc.push({ id, level, text: stripHtml(text) });
    return `<h${level} id="${escapeHtmlAttribute(id)}">${text}</h${level}>`;
  };

  marked.use({
    renderer,
    extensions: [
      blockMathExtension,
      inlineMathExtension,
      definitionListExtension,
      superscriptExtension,
      subscriptExtension,
      highlightExtension,
    ],
    hooks: {
      preprocess(markdown: string) {
        if (context.suppressFootnotes) return markdown;
        resetExtendedMarkdownState();
        return applyFootnotes(extractFootnoteDefinitions(markdown));
      },
    },
  } as any);

  markedInstance = marked;
  return marked;
}

const blockMathExtension = {
  name: "blockMath",
  level: "block",
  start(src: string) {
    const match = src.match(/^\$\$/m);
    return match ? match.index : undefined;
  },
  tokenizer(src: string) {
    const match = BLOCK_MATH_PATTERN.exec(src);
    if (!match) return undefined;
    return { type: "blockMath", raw: match[0], text: match[1] };
  },
  renderer(token: any) {
    return `<div class="math-block" data-tex="${escapeHtmlAttribute(token.text)}">$$\n${escapeHtml(token.text)}\n$$</div>\n`;
  },
};

const inlineMathExtension = {
  name: "inlineMath",
  level: "inline",
  start(src: string) {
    const index = src.indexOf("$");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const match = INLINE_MATH_PATTERN.exec(src);
    if (!match) return undefined;
    return { type: "inlineMath", raw: match[0], text: match[1] };
  },
  renderer(token: any) {
    return `<span class="math-inline" data-tex="${escapeHtmlAttribute(token.text)}">${escapeHtml(token.raw)}</span>`;
  },
};

const definitionListExtension = {
  name: "definitionList",
  level: "block",
  start(src: string) {
    const match = src.match(/\n:[ \t]+/);
    return typeof match?.index === "number" ? match.index + 1 : undefined;
  },
  tokenizer(src: string) {
    const lines = src.split("\n");
    if (lines.length < 2) return undefined;
    const term = lines[0];
    if (EMPTY_LINE_PATTERN.test(term) || MARKDOWN_LIST_MARKER_PATTERN.test(term)) return undefined;
    if (!DEFINITION_LIST_ITEM_PATTERN.test(lines[1])) return undefined;
    const definitions: string[] = [];
    const rawLines = [term];
    let index = 1;
    while (index < lines.length) {
      const itemMatch = DEFINITION_LIST_ITEM_PATTERN.exec(lines[index]);
      if (!itemMatch) break;
      rawLines.push(lines[index]);
      const definitionLines = [itemMatch[1]];
      index += 1;
      while (index < lines.length) {
        const line = lines[index];
        if (DEFINITION_LIST_ITEM_PATTERN.test(line)) break;
        if (EMPTY_LINE_PATTERN.test(line)) break;
        const continuation = /^(?: {2,}|\t)(.*)$/.exec(line);
        if (!continuation) break;
        rawLines.push(line);
        definitionLines.push(continuation[1]);
        index += 1;
      }
      definitions.push(definitionLines.join("\n").trim());
    }
    if (definitions.length === 0) return undefined;
    return { type: "definitionList", raw: rawLines.join("\n"), term: term.trim(), definitions };
  },
  renderer(token: any) {
    const termHtml = parseInlineWithoutFootnotes(token.term);
    const definitions = token.definitions
      .map((definition: string) => `<dd>${renderDefinitionContent(definition)}</dd>`)
      .join("");
    return `<dl><dt>${termHtml}</dt>${definitions}</dl>\n`;
  },
};

const superscriptExtension = {
  name: "superscript",
  level: "inline",
  start(src: string) {
    const index = src.indexOf("^");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const match = SUPERSCRIPT_PATTERN.exec(src);
    return match ? { type: "superscript", raw: match[0], text: match[1] } : undefined;
  },
  renderer(token: any) {
    return `<sup>${parseInlineWithoutFootnotes(token.text)}</sup>`;
  },
};

const subscriptExtension = {
  name: "subscript",
  level: "inline",
  start(src: string) {
    const index = src.indexOf("~");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const match = SUBSCRIPT_PATTERN.exec(src);
    return match ? { type: "subscript", raw: match[0], text: match[1] } : undefined;
  },
  renderer(token: any) {
    return `<sub>${parseInlineWithoutFootnotes(token.text)}</sub>`;
  },
};

const highlightExtension = {
  name: "highlight",
  level: "inline",
  start(src: string) {
    const index = src.indexOf("==");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const match = HIGHLIGHT_PATTERN.exec(src);
    return match ? { type: "highlight", raw: match[0], text: match[1] } : undefined;
  },
  renderer(token: any) {
    return `<mark>${parseInlineWithoutFootnotes(token.text)}</mark>`;
  },
};

function resetExtendedMarkdownState() {
  context.footnoteDefinitions.clear();
  context.footnoteOrder.length = 0;
  context.footnoteRefCounts.clear();
  context.footnoteFirstRefId.clear();
  context.anonymousFootnoteCounter = 0;
}

function extractFootnoteDefinitions(markdown: string) {
  const lines = markdown.split("\n");
  const preserved: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const match = /^([ \t]{0,3})\[\^([^\]\n]+)\]:[ \t]*(.*)$/.exec(lines[index]);
    if (!match) {
      preserved.push(lines[index]);
      index += 1;
      continue;
    }
    const baseIndent = match[1] || "";
    const id = match[2].trim();
    const definitionLines = [match[3] || ""];
    index += 1;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.startsWith(baseIndent)) break;
      const lineAfterBase = line.slice(baseIndent.length);
      const indented = /^(?: {2,}|\t)(.*)$/.exec(lineAfterBase);
      if (!indented) break;
      definitionLines.push(indented[1]);
      index += 1;
    }
    context.footnoteDefinitions.set(id, definitionLines.join("\n").trim());
  }
  return preserved.join("\n");
}

function applyFootnotes(markdown: string) {
  const withRefs = markdown.replace(/\[\^([^\]\n]+)\]/g, (_match, idText) => {
    const id = String(idText || "").trim();
    if (!id) return _match;
    if (!context.footnoteOrder.includes(id)) context.footnoteOrder.push(id);
    const refCount = (context.footnoteRefCounts.get(id) || 0) + 1;
    context.footnoteRefCounts.set(id, refCount);
    const normalized = normalizeFootnoteId(id);
    const refId = `fnref-${normalized}${refCount > 1 ? `-${refCount}` : ""}`;
    if (!context.footnoteFirstRefId.has(id)) context.footnoteFirstRefId.set(id, refId);
    const noteNumber = context.footnoteOrder.indexOf(id) + 1;
    return `<sup id="${escapeHtmlAttribute(refId)}" class="footnote-ref"><a href="#fn-${escapeHtmlAttribute(normalized)}" aria-label="Footnote ${noteNumber}">[${noteNumber}]</a></sup>`;
  });
  const footnotes = context.footnoteOrder
    .filter((id) => context.footnoteDefinitions.has(id))
    .map((id) => {
      const normalized = normalizeFootnoteId(id);
      const backRefId = context.footnoteFirstRefId.get(id) || `fnref-${normalized}`;
      const back = `<a href="#${escapeHtmlAttribute(backRefId)}" class="footnote-backref" aria-label="Back to content">Back</a>`;
      return `<li id="fn-${escapeHtmlAttribute(normalized)}">${renderDefinitionContent(context.footnoteDefinitions.get(id) || "", back)}</li>`;
    })
    .join("");
  return footnotes ? `${withRefs}\n\n<section class="footnotes"><hr><ol>${footnotes}</ol></section>` : withRefs;
}

function renderDefinitionContent(content: string, appendHtml = "") {
  const paragraphs = String(content || "")
    .split(/\n(?:[ \t]*\n)+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (appendHtml) {
    if (paragraphs.length === 0) paragraphs.push(appendHtml);
    else paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${appendHtml}`;
  }
  return paragraphs.map((paragraph) => `<p>${parseInlineWithoutFootnotes(paragraph)}</p>`).join("");
}

function parseInlineWithoutFootnotes(text: string) {
  context.suppressFootnotes = true;
  try {
    return getMarked().parseInline(text, { async: false }) as string;
  } finally {
    context.suppressFootnotes = false;
  }
}

function normalizeFootnoteId(id: string) {
  const normalized = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized) return normalized;
  context.anonymousFootnoteCounter += 1;
  return `footnote-${context.anonymousFootnoteCounter}`;
}

function splitMarkdownBlocks(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ source: string; startLine: number; endLine: number }> = [];
  let buffer: string[] = [];
  let startLine = 1;
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let inMathBlock = false;

  function flush(endLine: number) {
    const source = buffer.join("\n").trimEnd();
    if (source.trim()) blocks.push({ source, startLine, endLine });
    buffer = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    const trimmed = line.trim();
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
        inFence = false;
      }
    }
    if (!inFence && trimmed === "$$") inMathBlock = !inMathBlock;
    if (!inFence && !inMathBlock && trimmed === "") {
      flush(lineNumber);
      startLine = lineNumber + 1;
      continue;
    }
    if (buffer.length === 0) startLine = lineNumber;
    buffer.push(line);
  }
  flush(lines.length);
  return blocks;
}

function isSegmentedPreviewSafe(markdown: string) {
  if (/^\s*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(markdown)) return false;
  if (/^\[[^\]\n]+\]:\s+\S+/m.test(markdown)) return false;
  if (/\[\^[^\]\n]+\]/.test(markdown)) return false;
  if (/\n:[ \t]+/.test(markdown)) return false;
  if (/^\s{0,3}<\/?[a-zA-Z][\w:-]*(?:\s|>|\/>)/m.test(markdown)) return false;
  return true;
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function uniqueSlug(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const fallback = base || `heading-${Math.random().toString(36).slice(2, 8)}`;
  let slug = fallback;
  let index = 2;
  while (context.toc.some((entry) => entry.id === slug)) {
    slug = `${fallback}-${index}`;
    index += 1;
  }
  return slug;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

function diagramLabel(engine: string) {
  const labels: Record<string, string> = {
    mermaid: "Mermaid",
    abc: "ABC notation",
    geojson: "GeoJSON map",
    topojson: "TopoJSON map",
    stl: "STL model",
    plantuml: "PlantUML",
    d2: "D2",
    graphviz: "Graphviz",
    vegalite: "Vega-Lite",
    "vega-lite": "Vega-Lite",
    wavedrom: "WaveDrom",
    markmap: "Markmap",
  };
  return labels[engine] || engine;
}

export function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
