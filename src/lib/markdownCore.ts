import { Marked, Renderer } from "marked";
import type { LanguageFn } from "highlight.js";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yamlLanguage from "highlight.js/lib/languages/yaml";
import * as yaml from "js-yaml";
import type { ProfessionalProfile, RenderBlock, RenderResult, TocEntry } from "../types";
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
const IMAGE_SIZE_SUFFIX_PATTERN = /\|(\d+)(?:x(\d+))?$/;
const MP_PROFILE_PATTERN = /^<MpProfile\b([^>]*)\/?>/;
const COLON_CONTAINER_PATTERN = /^:::\s*([A-Za-z][\w-]*)(?:\s*(?:\[([^\]\n]+)\]|([^\n]*)))?\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/;
const HUGO_SHORTCODE_PATTERN = /^\{\{[<%]\s*([\w.-]+)([\s\S]*?)[%>]\}\}/;
const LIQUID_HIGHLIGHT_PATTERN = /^\{%\s*highlight\s+([\w+-]+)[^%]*%\}\n([\s\S]*?)\n\{%\s*endhighlight\s*%\}/;
const LIQUID_TAG_PATTERN = /^(\{%\s*[\s\S]*?%\}|\{\{(?![<%])\s*[\s\S]*?\}\})/;
const MDX_IMPORT_EXPORT_PATTERN = /^(?:import|export)\s+[^\n]*(?:\n|$)/;
const MDX_TABS_PATTERN = /^<Tabs\b[\s\S]*?<\/Tabs>/;
const MDX_COMPONENT_PATTERN = /^<([A-Z][\w.]*)\b[^>]*(?:\/>|>[\s\S]*?<\/\1>)/;

const GITHUB_ALERT_LABELS: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

interface MarkdownContext {
  activeProfile: ProfessionalProfile;
  footnoteDefinitions: Map<string, string>;
  footnoteOrder: string[];
  footnoteRefCounts: Map<string, number>;
  footnoteFirstRefId: Map<string, string>;
  anonymousFootnoteCounter: number;
  suppressFootnotes: boolean;
  toc: TocEntry[];
}

const context: MarkdownContext = {
  activeProfile: "standard",
  footnoteDefinitions: new Map(),
  footnoteOrder: [],
  footnoteRefCounts: new Map(),
  footnoteFirstRefId: new Map(),
  anonymousFootnoteCounter: 0,
  suppressFootnotes: false,
  toc: [],
};

let markedInstance: Marked | null = null;

const HIGHLIGHT_LANGUAGES: Array<[string, LanguageFn]> = [
  ["bash", bash],
  ["sh", bash],
  ["shell", bash],
  ["c", c],
  ["cpp", cpp],
  ["c++", cpp],
  ["csharp", csharp],
  ["cs", csharp],
  ["css", css],
  ["diff", diff],
  ["go", go],
  ["java", java],
  ["javascript", javascript],
  ["js", javascript],
  ["json", json],
  ["markdown", markdown],
  ["md", markdown],
  ["php", php],
  ["powershell", powershell],
  ["ps1", powershell],
  ["python", python],
  ["py", python],
  ["ruby", ruby],
  ["rb", ruby],
  ["rust", rust],
  ["rs", rust],
  ["sql", sql],
  ["typescript", typescript],
  ["ts", typescript],
  ["html", xml],
  ["xml", xml],
  ["yaml", yamlLanguage],
  ["yml", yamlLanguage],
];

HIGHLIGHT_LANGUAGES.forEach(([name, language]) => hljs.registerLanguage(name, language));

export function renderMarkdownToHtml(markdown: string, segmented = true, profile: ProfessionalProfile = "standard"): RenderResult {
  const warnings: string[] = [];
  const frontmatterResult = parseFrontmatter(markdown);
  const body = frontmatterResult.body;
  context.activeProfile = profile;
  context.toc = [];

  if (segmented && isSegmentedPreviewSafe(body, profile)) {
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

  renderer.image = (tokenOrHref: any, legacyTitle?: string, legacyText?: string) => {
    const href = typeof tokenOrHref === "object" ? tokenOrHref.href || "" : String(tokenOrHref || "");
    const title = typeof tokenOrHref === "object" ? tokenOrHref.title || "" : String(legacyTitle || "");
    let text = typeof tokenOrHref === "object" ? tokenOrHref.text || "" : String(legacyText || "");
    const sizeMatch = isProfile("wechat") ? IMAGE_SIZE_SUFFIX_PATTERN.exec(text) : null;
    let sizeAttrs = "";
    if (sizeMatch) {
      text = text.replace(IMAGE_SIZE_SUFFIX_PATTERN, "");
      if (sizeMatch[1]) sizeAttrs += ` width="${escapeHtmlAttribute(sizeMatch[1])}"`;
      if (sizeMatch[2]) sizeAttrs += ` height="${escapeHtmlAttribute(sizeMatch[2])}"`;
    }
    const titleAttr = title ? ` title="${escapeHtmlAttribute(title)}"` : "";
    return `<img src="${escapeHtmlAttribute(href)}" alt="${escapeHtmlAttribute(text)}"${titleAttr}${sizeAttrs}>`;
  };

  marked.use({
    renderer,
    extensions: [
      mpProfileExtension,
      colonContainerExtension,
      mkdocsAdmonitionExtension,
      hugoShortcodeExtension,
      liquidHighlightExtension,
      liquidTagExtension,
      mdxImportExportExtension,
      mdxTabsExtension,
      mdxComponentExtension,
      horizontalSliderExtension,
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

const colonContainerExtension = {
  name: "colonContainer",
  level: "block",
  start(src: string) {
    if (!isAnyProfile(["docusaurus", "vitepress", "astro"])) return undefined;
    const match = src.match(/^:::/m);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isAnyProfile(["docusaurus", "vitepress", "astro"])) return undefined;
    const match = COLON_CONTAINER_PATTERN.exec(src);
    if (!match) return undefined;
    return {
      type: "colonContainer",
      raw: match[0],
      kind: (match[1] || "info").toLowerCase(),
      title: (match[2] || match[3] || "").trim(),
      text: match[4] || "",
    };
  },
  renderer(token: any) {
    const kind = normalizeAdmonitionKind(token.kind);
    const title = token.title || defaultAdmonitionTitle(kind);
    const body = renderPlatformMarkdown(token.text || "");
    if (kind === "details") {
      return `<details class="platform-admonition platform-admonition-details"><summary>${escapeHtml(title)}</summary><div class="platform-admonition-body">${body}</div></details>\n`;
    }
    if (kind === "raw") {
      return `<div class="platform-raw">${escapeHtml(token.text || "")}</div>\n`;
    }
    return `<div class="platform-admonition platform-admonition-${escapeHtmlAttribute(kind)}">` +
      `<p class="platform-admonition-title">${escapeHtml(title)}</p>` +
      `<div class="platform-admonition-body">${body}</div>` +
      `</div>\n`;
  },
};

const mkdocsAdmonitionExtension = {
  name: "mkdocsAdmonition",
  level: "block",
  start(src: string) {
    if (!isProfile("mkdocs")) return undefined;
    const match = src.match(/^(?:!!!|\?\?\?\+?)/m);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isProfile("mkdocs")) return undefined;
    const parsed = parseMkdocsAdmonition(src);
    if (!parsed) return undefined;
    return { type: "mkdocsAdmonition", ...parsed };
  },
  renderer(token: any) {
    const kind = normalizeAdmonitionKind(token.kind);
    const title = token.title || defaultAdmonitionTitle(kind);
    const body = renderPlatformMarkdown(token.text || "");
    if (token.collapsible) {
      const openAttr = token.open ? " open" : "";
      return `<details class="platform-admonition platform-admonition-${escapeHtmlAttribute(kind)} platform-admonition-collapsible"${openAttr}>` +
        `<summary>${escapeHtml(title)}</summary><div class="platform-admonition-body">${body}</div></details>\n`;
    }
    return `<div class="platform-admonition platform-admonition-${escapeHtmlAttribute(kind)}">` +
      `<p class="platform-admonition-title">${escapeHtml(title)}</p>` +
      `<div class="platform-admonition-body">${body}</div>` +
      `</div>\n`;
  },
};

const hugoShortcodeExtension = {
  name: "hugoShortcode",
  level: "block",
  start(src: string) {
    if (!isProfile("hugo")) return undefined;
    const match = src.match(/\{\{[<%]/);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isProfile("hugo")) return undefined;
    const match = HUGO_SHORTCODE_PATTERN.exec(src);
    if (!match) return undefined;
    return {
      type: "hugoShortcode",
      raw: match[0],
      name: match[1],
      params: match[2] || "",
    };
  },
  renderer(token: any) {
    return renderHugoShortcode(String(token.name || ""), String(token.params || ""), String(token.raw || ""));
  },
};

const liquidHighlightExtension = {
  name: "liquidHighlight",
  level: "block",
  start(src: string) {
    if (!isProfile("jekyll")) return undefined;
    const match = src.match(/\{%\s*highlight\b/);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isProfile("jekyll")) return undefined;
    const match = LIQUID_HIGHLIGHT_PATTERN.exec(src);
    if (!match) return undefined;
    return { type: "liquidHighlight", raw: match[0], lang: match[1], text: match[2] || "" };
  },
  renderer(token: any) {
    const lang = String(token.lang || "").toLowerCase();
    const validLanguage = lang && hljs.getLanguage(lang) ? lang : "plaintext";
    const highlighted = validLanguage !== "plaintext"
      ? hljs.highlight(String(token.text || ""), { language: validLanguage }).value
      : escapeHtml(String(token.text || ""));
    return `<pre class="platform-liquid-highlight"><code class="hljs language-${escapeHtmlAttribute(validLanguage)}">${highlighted}</code></pre>\n`;
  },
};

const liquidTagExtension = {
  name: "liquidTag",
  level: "block",
  start(src: string) {
    if (!isProfile("jekyll")) return undefined;
    const tagMatch = src.match(/\{%|\{\{(?![<%])/);
    return typeof tagMatch?.index === "number" ? tagMatch.index : undefined;
  },
  tokenizer(src: string) {
    if (!isProfile("jekyll")) return undefined;
    const match = LIQUID_TAG_PATTERN.exec(src);
    if (!match) return undefined;
    if (/^\{%\s*(?:highlight|endhighlight)\b/.test(match[0])) return undefined;
    return { type: "liquidTag", raw: match[0], text: match[1] };
  },
  renderer(token: any) {
    const text = String(token.text || "").trim();
    const include = /^\{%\s*include\s+([^%\s]+)/.exec(text);
    const label = include ? `Jekyll include: ${include[1]}` : "Liquid";
    return `<div class="platform-directive platform-liquid"><span>${escapeHtml(label)}</span><code>${escapeHtml(text)}</code></div>\n`;
  },
};

const mdxImportExportExtension = {
  name: "mdxImportExport",
  level: "block",
  start(src: string) {
    if (!isAnyProfile(["docusaurus", "astro"])) return undefined;
    const match = src.match(/^(?:import|export)\s+/m);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isAnyProfile(["docusaurus", "astro"])) return undefined;
    const match = MDX_IMPORT_EXPORT_PATTERN.exec(src);
    if (!match) return undefined;
    return { type: "mdxImportExport", raw: match[0], text: match[0].trim() };
  },
  renderer(token: any) {
    return `<div class="platform-directive platform-mdx"><span>MDX module</span><code>${escapeHtml(String(token.text || ""))}</code></div>\n`;
  },
};

const mdxTabsExtension = {
  name: "mdxTabs",
  level: "block",
  start(src: string) {
    if (!isProfile("docusaurus")) return undefined;
    const match = src.match(/<Tabs\b/);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isProfile("docusaurus")) return undefined;
    const match = MDX_TABS_PATTERN.exec(src);
    if (!match) return undefined;
    return { type: "mdxTabs", raw: match[0], text: match[0] };
  },
  renderer(token: any) {
    const items = Array.from(String(token.text || "").matchAll(/<TabItem\b([^>]*)>([\s\S]*?)<\/TabItem>/g))
      .map((match) => {
        const props = parseXmlLikeProps(match[1] || "");
        const label = props.label || props.value || "Tab";
        return { label, body: renderPlatformMarkdown(match[2] || "") };
      });
    if (!items.length) {
      return renderComponentPlaceholder("Tabs", String(token.text || ""));
    }
    return `<div class="platform-tabs">` +
      `<div class="platform-tab-list">${items.map((item, index) => `<span class="${index === 0 ? "active" : ""}">${escapeHtml(item.label)}</span>`).join("")}</div>` +
      `<div class="platform-tab-panel">${items[0].body}</div>` +
      `</div>\n`;
  },
};

const mdxComponentExtension = {
  name: "mdxComponent",
  level: "block",
  start(src: string) {
    if (!isAnyProfile(["docusaurus", "vitepress", "astro"])) return undefined;
    const match = src.match(/^<[A-Z]/m);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isAnyProfile(["docusaurus", "vitepress", "astro"])) return undefined;
    const match = MDX_COMPONENT_PATTERN.exec(src);
    if (!match) return undefined;
    if (match[1] === "Tabs") return undefined;
    return { type: "mdxComponent", raw: match[0], name: match[1], text: match[0] };
  },
  renderer(token: any) {
    if (isProfile("wechat") && String(token.name || "") === "MpProfile") {
      const propsText = String(token.text || "").replace(/^<MpProfile\b/, "").replace(/\/?>$/, "");
      return renderMpProfile(parseXmlLikeProps(propsText));
    }
    return renderComponentPlaceholder(String(token.name || "Component"), String(token.text || ""));
  },
};

const mpProfileExtension = {
  name: "mpProfile",
  level: "block",
  start(src: string) {
    if (!isProfile("wechat")) return undefined;
    const match = src.match(/<MpProfile\b/);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isProfile("wechat")) return undefined;
    const match = MP_PROFILE_PATTERN.exec(src);
    if (!match) return undefined;
    return { type: "mpProfile", raw: match[0], props: parseXmlLikeProps(match[1] || "") };
  },
  renderer(token: any) {
    return renderMpProfile(token.props || {});
  },
};

const horizontalSliderExtension = {
  name: "horizontalSlider",
  level: "block",
  start(src: string) {
    if (!isProfile("wechat")) return undefined;
    const match = src.match(/^<!\[/m);
    return typeof match?.index === "number" ? match.index : undefined;
  },
  tokenizer(src: string) {
    if (!isProfile("wechat")) return undefined;
    const match = /^<(!\[.*?\]\(.*?\)(?:,!\[.*?\]\(.*?\))*)>/.exec(src);
    if (!match) return undefined;
    return { type: "horizontalSlider", raw: match[0], text: match[1] };
  },
  renderer(token: any) {
    const images = Array.from(String(token.text || "").matchAll(/!\[(.*?)\]\((.*?)\)/g))
      .map((match) => ({ alt: match[1] || "", src: match[2] || "" }))
      .filter((image) => image.src);
    if (!images.length) return "";
    return `<section class="wechat-slider" style="box-sizing:border-box;font-size:16px;">` +
      `<section data-role="outer" style="font-family:Microsoft YaHei, sans-serif;font-size:16px;">` +
      `<section data-role="paragraph" style="margin:0 auto;box-sizing:border-box;width:100%;">` +
      `<section style="margin:0 auto;text-align:center;">` +
      `<section style="display:inline-block;width:100%;">` +
      `<section style="overflow-x:scroll;-webkit-overflow-scrolling:touch;white-space:nowrap;width:100%;text-align:center;">` +
      images.map((image) => `<section style="display:inline-block;width:100%;margin-right:0;vertical-align:top;">` +
        `<img src="${escapeHtmlAttribute(image.src)}" alt="${escapeHtmlAttribute(image.alt)}" title="${escapeHtmlAttribute(image.alt)}" style="width:100%;height:auto;border-radius:4px;vertical-align:top;">` +
        `<p style="margin-top:5px;font-size:14px;color:#666;text-align:center;white-space:normal;">${escapeHtml(image.alt)}</p>` +
        `</section>`).join("") +
      `</section></section></section></section></section>` +
      `<p style="font-size:14px;color:#999;text-align:center;margin-top:5px;">&lt;&lt;&lt; 左右滑动看更多 &gt;&gt;&gt;</p>` +
      `</section>\n`;
  },
};

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

function renderPlatformMarkdown(text: string) {
  return getMarked().parse(String(text || "").trim(), { async: false }) as string;
}

function parseXmlLikeProps(value: string) {
  const props: Record<string, string> = {};
  for (const match of value.matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)')/g)) {
    props[match[1]] = unescapeHtml(match[2] !== undefined ? match[2] : match[3] || "");
  }
  return props;
}

function parseShortcodeParams(value: string) {
  const props: Record<string, string> = {};
  const positional: string[] = [];
  for (const match of value.matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))|("[^"]*"|'[^']*'|[^\s]+)/g)) {
    if (match[1]) props[match[1]] = unescapeHtml(match[2] ?? match[3] ?? match[4] ?? "");
    else if (match[5]) positional.push(unescapeHtml(match[5].replace(/^['"]|['"]$/g, "")));
  }
  return { props, positional };
}

function parseMkdocsAdmonition(src: string) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const first = /^(!!!|\?\?\?\+?)\s+([\w+-]+)(?:\s+(.+))?\s*$/.exec(lines[0] || "");
  if (!first) return null;
  const rawLines = [lines[0]];
  const bodyLines: string[] = [];
  let index = 1;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*$/.test(line)) {
      rawLines.push(line);
      bodyLines.push("");
      index += 1;
      continue;
    }
    const body = /^(?: {4}|\t)(.*)$/.exec(line);
    if (!body) break;
    rawLines.push(line);
    bodyLines.push(body[1]);
    index += 1;
  }
  if (!bodyLines.some((line) => line.trim())) return null;
  const title = String(first[3] || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return {
    raw: rawLines.join("\n"),
    kind: first[2],
    title,
    text: bodyLines.join("\n"),
    collapsible: first[1].startsWith("???"),
    open: first[1] === "???+",
  };
}

function normalizeAdmonitionKind(value: string) {
  const kind = String(value || "info").toLowerCase();
  const aliases: Record<string, string> = {
    abstract: "info",
    attention: "warning",
    bug: "danger",
    caution: "warning",
    check: "tip",
    danger: "danger",
    done: "tip",
    error: "danger",
    example: "info",
    failure: "danger",
    help: "info",
    hint: "tip",
    important: "warning",
    info: "info",
    note: "note",
    question: "info",
    quote: "info",
    success: "tip",
    summary: "info",
    tip: "tip",
    todo: "info",
    warning: "warning",
  };
  if (kind === "details" || kind === "raw") return kind;
  return aliases[kind] || kind;
}

function defaultAdmonitionTitle(kind: string) {
  const labels: Record<string, string> = {
    danger: "Danger",
    details: "Details",
    info: "Info",
    note: "Note",
    raw: "Raw",
    tip: "Tip",
    warning: "Warning",
  };
  return labels[kind] || titleCase(kind);
}

function renderHugoShortcode(name: string, rawParams: string, raw: string) {
  const { props, positional } = parseShortcodeParams(rawParams);
  const normalized = name.toLowerCase();
  if (normalized === "figure") {
    const src = props.src || positional[0] || "";
    const title = props.title || props.caption || "";
    const alt = props.alt || title || "Figure";
    if (src) {
      return `<figure class="platform-shortcode-figure"><img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}">` +
        `${title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ""}</figure>\n`;
    }
  }
  if (["youtube", "vimeo", "tweet", "x", "instagram"].includes(normalized)) {
    const target = props.id || positional[0] || "";
    return `<div class="platform-embed"><span>${escapeHtml(titleCase(normalized))}</span><code>${escapeHtml(target || raw.trim())}</code></div>\n`;
  }
  if (["ref", "relref"].includes(normalized)) {
    return `<code class="platform-inline-code">${escapeHtml(positional[0] || props.path || raw.trim())}</code>\n`;
  }
  return `<div class="platform-directive platform-shortcode"><span>Hugo shortcode: ${escapeHtml(name)}</span><code>${escapeHtml(raw.trim())}</code></div>\n`;
}

function renderMpProfile(props: Record<string, string>) {
  const mpId = props.mpId || props.id || "";
  const nickname = props.nickname || props.name || "";
  if (!mpId || !nickname) return "";
  const headimg = props.headimg || props.logo || "";
  const signature = props.signature || props.description || "";
  const serviceType = props.serviceType || "1";
  const verifyStatus = props.verifyStatus || "0";
  return `<section class="mp_profile_iframe_wrp custom_select_card_wrp" nodeleaf="">` +
    `<mp-common-profile class="mpprofile js_uneditable custom_select_card mp_profile_iframe" data-pluginname="mpprofile" data-id="${escapeHtmlAttribute(mpId)}" data-nickname="${escapeHtmlAttribute(nickname)}" data-headimg="${escapeHtmlAttribute(headimg)}" data-signature="${escapeHtmlAttribute(signature)}" data-service_type="${escapeHtmlAttribute(serviceType)}" data-verify_status="${escapeHtmlAttribute(verifyStatus)}"></mp-common-profile>` +
    `<br class="ProseMirror-trailingBreak">` +
    `</section>\n`;
}

function renderComponentPlaceholder(name: string, raw: string) {
  return `<div class="platform-directive platform-component"><span>Component: ${escapeHtml(name)}</span><code>${escapeHtml(raw.trim())}</code></div>\n`;
}

function titleCase(value: string) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function isSegmentedPreviewSafe(markdown: string, profile: ProfessionalProfile) {
  if (/^\s*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(markdown)) return false;
  if (/^\[[^\]\n]+\]:\s+\S+/m.test(markdown)) return false;
  if (/\[\^[^\]\n]+\]/.test(markdown)) return false;
  if (/\n:[ \t]+/.test(markdown)) return false;
  if (["docusaurus", "vitepress", "astro"].includes(profile) && /^:::/m.test(markdown)) return false;
  if (profile === "mkdocs" && /^(?:!!!|\?\?\?\+?)\s+/m.test(markdown)) return false;
  if (profile === "hugo" && /\{\{[<%]/.test(markdown)) return false;
  if (profile === "jekyll" && (/\{%|\{\{(?![<%])/.test(markdown))) return false;
  if (["docusaurus", "astro"].includes(profile) && /^(?:import|export)\s+/m.test(markdown)) return false;
  if (["docusaurus", "vitepress", "astro", "wechat"].includes(profile) && /^<[A-Z]/m.test(markdown)) return false;
  if (profile === "wechat" && /^<!\[/m.test(markdown)) return false;
  if (/^\s{0,3}<\/?[a-zA-Z][\w:-]*(?:\s|>|\/>)/m.test(markdown)) return false;
  return true;
}

function isProfile(profile: ProfessionalProfile) {
  return context.activeProfile === profile;
}

function isAnyProfile(profiles: ProfessionalProfile[]) {
  return profiles.includes(context.activeProfile);
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

function unescapeHtml(value: string) {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
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
