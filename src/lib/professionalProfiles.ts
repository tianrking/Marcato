import type { ProfessionalProfile } from "../types";

export type ProfessionalSeverity = "info" | "warn" | "danger";

export interface ProfessionalProfileMeta {
  id: ProfessionalProfile;
  label: string;
  shortLabel: string;
  description: string;
  previewHint: string;
}

export interface ProfessionalIssue {
  code: string;
  line?: number;
  message: string;
  severity: ProfessionalSeverity;
}

export interface ProfessionalReport {
  issues: ProfessionalIssue[];
  profile: ProfessionalProfileMeta;
  score: number;
  strengths: string[];
}

export const PROFESSIONAL_PROFILES: Record<ProfessionalProfile, ProfessionalProfileMeta> = {
  standard: {
    id: "standard",
    label: "Marcato Standard",
    shortLabel: "Standard",
    description: "Full Marcato preview with diagrams, math, export, sharing, and local-first behavior.",
    previewHint: "General Markdown studio",
  },
  wechat: {
    id: "wechat",
    label: "WeChat Official Account",
    shortLabel: "WeChat",
    description: "Narrow article canvas with paste-oriented warnings for rich-text publication.",
    previewHint: "Rich-text paste target",
  },
  github: {
    id: "github",
    label: "GitHub Markdown",
    shortLabel: "GitHub",
    description: "README, issue, discussion, and pull-request style compatibility for GitHub Flavored Markdown.",
    previewHint: "GFM / README",
  },
  docusaurus: {
    id: "docusaurus",
    label: "Docusaurus / MDX",
    shortLabel: "Docusaurus",
    description: "Documentation preview for MDX content, admonitions, tabs, and frontmatter-driven docs.",
    previewHint: "MDX docs",
  },
  vitepress: {
    id: "vitepress",
    label: "VitePress",
    shortLabel: "VitePress",
    description: "Vue-powered docs profile with VitePress containers, frontmatter, and local link checks.",
    previewHint: "Vue docs",
  },
  mkdocs: {
    id: "mkdocs",
    label: "Material for MkDocs",
    shortLabel: "MkDocs",
    description: "Material-style docs preview for Python documentation, admonitions, and code annotations.",
    previewHint: "Material docs",
  },
  hugo: {
    id: "hugo",
    label: "Hugo / Goldmark",
    shortLabel: "Hugo",
    description: "Static blog profile for Hugo frontmatter, Goldmark, shortcodes, and content pages.",
    previewHint: "Goldmark blog",
  },
  jekyll: {
    id: "jekyll",
    label: "Jekyll / GitHub Pages",
    shortLabel: "Jekyll",
    description: "Blog-aware profile for YAML frontmatter, Kramdown-flavored Markdown, and GitHub Pages.",
    previewHint: "Pages blog",
  },
  astro: {
    id: "astro",
    label: "Astro / Starlight",
    shortLabel: "Astro",
    description: "Content collection profile for Markdown, MDX, and frontmatter-heavy docs.",
    previewHint: "Astro content",
  },
};

const FENCE_PATTERN = /^ {0,3}```([^\s`]*)[\s\S]*?^ {0,3}```/gm;
const FRONTMATTER_PATTERN = /^\s*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const RAW_HTML_PATTERN = /^ {0,3}<([a-z][\w:-]*)(?:\s|>|\/)/gim;
const SCRIPT_STYLE_PATTERN = /^ {0,3}<(script|style)(?:\s|>|\/)/gim;
const GITHUB_ALERT_PATTERN = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gim;
const DOCUSAURUS_CONTAINER_PATTERN = /^:::\s*(note|tip|info|warning|danger|caution)\b/gim;
const VITEPRESS_CONTAINER_PATTERN = /^:::\s*(info|tip|warning|danger|details|raw)\b/gim;
const MKDOCS_ADMONITION_PATTERN = /^!!!\s*([\w+-]+)\b/gim;
const SHORTCODE_PATTERN = /\{\{[%<][\s\S]*?[%>]\}\}/g;
const LIQUID_PATTERN = /\{%[\s\S]*?%\}|\{\{(?![<%])[\s\S]*?\}\}/g;
const JSX_OR_VUE_PATTERN = /^ {0,3}<[A-Z][\w.:-]*(?:\s|>|\/)/gm;
const MDX_IMPORT_EXPORT_PATTERN = /^(?:import|export)\s+/gm;
const DOCUSAURUS_TABS_PATTERN = /^ {0,3}<Tabs\b/gm;
const VITEPRESS_TOC_PATTERN = /^\[\[toc\]\]/gim;
const MKDOCS_CODE_ANNOTATION_PATTERN = /#\s*\(\d+\)/g;
const FOOTNOTE_PATTERN = /\[\^[^\]\n]+\]/g;
const TABLE_PATTERN = /^\|.+\|\s*\n\|[-:|\s]+\|/gm;
const LOCAL_IMAGE_PATTERN = /!\[[^\]]*]\((?!https?:|data:|\/|#)([^)\s]+)(?:\s+"[^"]*")?\)/gim;
const REMOTE_IMAGE_PATTERN = /!\[[^\]]*]\(https?:\/\/[^)]+\)/gim;
const MATH_PATTERN = /(^|\n)\$\$[\s\S]*?\$\$|\$(?!\s|\$)[^\n$]+\$/g;
const GITHUB_REFERENCE_PATTERN = /(^|\s)(?:@[a-z0-9-]+|#[1-9]\d*)\b/gi;
const INTERNAL_MD_LINK_PATTERN = /\[[^\]]+]\((?!https?:|mailto:|tel:|#)([^)\s]+\.md)(#[^)]+)?\)/gim;

const GITHUB_SUPPORTED_FENCES = new Set(["mermaid", "geojson", "topojson", "stl"]);
const MARCATO_RICH_FENCES = new Set(["abc", "plantuml", "d2", "graphviz", "dot", "vega-lite", "vegalite", "wavedrom", "markmap"]);

export function profileClassName(profile: ProfessionalProfile) {
  return `profile-${profile}`;
}

export function analyzeProfessionalProfile(markdown: string, profile: ProfessionalProfile): ProfessionalReport {
  const meta = PROFESSIONAL_PROFILES[profile] || PROFESSIONAL_PROFILES.standard;
  const issues: ProfessionalIssue[] = [];
  const strengths: string[] = [];
  const fences = collectFences(markdown);
  const hasFrontmatter = FRONTMATTER_PATTERN.test(markdown);
  const frontmatterFields = extractFrontmatterFields(markdown);
  const hasH1 = /^#\s+\S/m.test(markdown);

  if (hasH1) strengths.push("Has a top-level title.");
  if (hasFrontmatter) strengths.push("Includes YAML frontmatter.");
  if (fences.length > 0) strengths.push(`Uses ${fences.length} fenced code block(s).`);
  if (hasPattern(markdown, GITHUB_ALERT_PATTERN)) strengths.push("Uses GitHub-style alerts.");

  switch (profile) {
    case "wechat":
      requireH1(markdown, issues, "WeChat articles need a strong visible title before paste or export.");
      addIf(hasFrontmatter, issues, "wechat-frontmatter", "YAML frontmatter is useful for blogs, but it will not paste into the WeChat editor.", "warn", 1);
      addPatternIssue(markdown, MATH_PATTERN, issues, "wechat-math", "Math is not reliable in WeChat rich-text paste. Export it as an image when accuracy matters.", "warn");
      addPatternIssue(markdown, TABLE_PATTERN, issues, "wechat-table", "Wide Markdown tables often overflow on WeChat mobile articles. Prefer compact tables or images.", "warn");
      addPatternIssue(markdown, FOOTNOTE_PATTERN, issues, "wechat-footnote", "Footnote back-links and anchors may not survive WeChat paste.", "warn");
      addPatternIssue(markdown, RAW_HTML_PATTERN, issues, "wechat-html", "WeChat may strip unsupported HTML or attributes. Prefer plain Markdown plus inline-safe styling.", "warn");
      addPatternIssue(markdown, REMOTE_IMAGE_PATTERN, issues, "wechat-remote-image", "Remote images should be uploaded or verified inside the WeChat editor before publishing.", "info");
      addRichFenceIssues(fences, issues, "wechat-diagram", "Interactive diagrams will not paste as interactive content. Export SVG/PNG and place the image in WeChat.", "warn");
      if (markdown.length > 18_000) issues.push({ code: "wechat-length", message: "This is a long article; check mobile pacing, image weight, and section breaks before publishing.", severity: "info" });
      strengths.push("Preview uses a narrow mobile-publication canvas.");
      break;
    case "github":
      addIf(hasFrontmatter, issues, "github-frontmatter", "GitHub README and issue views show frontmatter as content; only GitHub Pages/Jekyll processes it.", "info", 1);
      for (const fence of fences) {
        if (MARCATO_RICH_FENCES.has(fence.language)) {
          issues.push({ code: "github-rich-fence", line: fence.line, message: `${fence.language || "This"} block renders in Marcato, but GitHub may show it as source text.`, severity: "warn" });
        }
      }
      addPatternIssue(markdown, DOCUSAURUS_CONTAINER_PATTERN, issues, "github-docusaurus-container", "Docusaurus ::: containers do not render as GitHub alerts.", "warn");
      addPatternIssue(markdown, MKDOCS_ADMONITION_PATTERN, issues, "github-mkdocs-admonition", "MkDocs !!! admonitions render as plain text on GitHub.", "warn");
      addPatternIssue(markdown, GITHUB_REFERENCE_PATTERN, issues, "github-reference", "GitHub references and mentions are live on GitHub, but stay plain text in exported HTML/PDF.", "info");
      strengths.push("GFM tables, task lists, strikethrough, footnotes, and alerts match this profile closely.");
      break;
    case "docusaurus":
      encourageFrontmatter(hasFrontmatter, issues, "docusaurus-frontmatter", "Add frontmatter such as title, description, sidebar_position, or slug for Docusaurus docs.");
      if (hasFrontmatter) {
        encourageFrontmatterField(frontmatterFields, ["title"], issues, "docusaurus-title", "Docusaurus docs usually need a frontmatter title for sidebar and SEO.");
        encourageFrontmatterField(frontmatterFields, ["description"], issues, "docusaurus-description", "Add description frontmatter for generated metadata and search snippets.");
      }
      addPatternIssue(markdown, GITHUB_ALERT_PATTERN, issues, "docusaurus-alert", "Prefer Docusaurus :::note / :::tip / :::warning admonitions over GitHub alert blockquotes.", "warn");
      addPatternIssue(markdown, MKDOCS_ADMONITION_PATTERN, issues, "docusaurus-mkdocs", "MkDocs !!! admonitions need conversion to Docusaurus ::: admonitions.", "warn");
      addPatternIssue(markdown, SCRIPT_STYLE_PATTERN, issues, "docusaurus-script-style", "Raw script/style tags are fragile in MDX. Move behavior into React components.", "danger");
      addPatternIssue(markdown, INTERNAL_MD_LINK_PATTERN, issues, "docusaurus-md-link", "Docusaurus usually resolves docs links by route; verify .md suffixes after build.", "info");
      addIf(hasPattern(markdown, DOCUSAURUS_TABS_PATTERN) && !/import\s+Tabs|from\s+['"]@theme\/Tabs['"]/.test(markdown), issues, "docusaurus-tabs-import", "Docusaurus Tabs usually need Tabs and TabItem imports in MDX.", "warn");
      if (hasPattern(markdown, MDX_IMPORT_EXPORT_PATTERN)) strengths.push("Uses MDX import/export lines.");
      strengths.push(hasPattern(markdown, DOCUSAURUS_CONTAINER_PATTERN) ? "Uses Docusaurus admonition containers." : "MDX profile is ready for imports, tabs, and admonitions.");
      break;
    case "vitepress":
      encourageFrontmatter(hasFrontmatter, issues, "vitepress-frontmatter", "Add frontmatter for title, description, layout, sidebar, or outline control.");
      if (hasFrontmatter) {
        encourageFrontmatterField(frontmatterFields, ["title"], issues, "vitepress-title", "VitePress pages benefit from a title field for theme metadata.");
        encourageFrontmatterField(frontmatterFields, ["description"], issues, "vitepress-description", "Add description frontmatter for SEO and social previews.");
      }
      addPatternIssue(markdown, MKDOCS_ADMONITION_PATTERN, issues, "vitepress-mkdocs", "MkDocs !!! admonitions should become VitePress ::: tip/warning/danger/details containers.", "warn");
      addPatternIssue(markdown, DOCUSAURUS_CONTAINER_PATTERN, issues, "vitepress-container", "Docusaurus containers are close, but VitePress uses info/tip/warning/danger/details naming.", "info");
      addPatternIssue(markdown, JSX_OR_VUE_PATTERN, issues, "vitepress-component", "Capitalized JSX/React components will not work in VitePress unless rewritten as Vue components.", "warn");
      addPatternIssue(markdown, INTERNAL_MD_LINK_PATTERN, issues, "vitepress-md-link", "VitePress rewrites internal Markdown links; verify route casing and file names.", "info");
      if (hasPattern(markdown, VITEPRESS_TOC_PATTERN)) strengths.push("Uses VitePress table-of-contents marker.");
      strengths.push(hasPattern(markdown, VITEPRESS_CONTAINER_PATTERN) ? "Uses VitePress custom containers." : "VitePress profile is tuned for docs-style headings and containers.");
      break;
    case "mkdocs":
      addPatternIssue(markdown, DOCUSAURUS_CONTAINER_PATTERN, issues, "mkdocs-docusaurus", "Docusaurus/VitePress ::: containers should become MkDocs Material !!! admonitions.", "warn");
      addPatternIssue(markdown, JSX_OR_VUE_PATTERN, issues, "mkdocs-component", "JSX/Vue components will not render in MkDocs Markdown.", "warn");
      addIf(hasFrontmatter, issues, "mkdocs-frontmatter", "YAML metadata needs the MkDocs meta extension or theme support.", "info", 1);
      addPatternIssue(markdown, SHORTCODE_PATTERN, issues, "mkdocs-shortcode", "Hugo shortcodes render as plain text in MkDocs unless a plugin handles them.", "warn");
      if (hasPattern(markdown, MKDOCS_CODE_ANNOTATION_PATTERN)) strengths.push("Uses Material for MkDocs code annotations.");
      strengths.push(hasPattern(markdown, MKDOCS_ADMONITION_PATTERN) ? "Uses MkDocs-style admonitions." : "Material preview emphasizes readable docs and code blocks.");
      break;
    case "hugo":
      encourageFrontmatter(hasFrontmatter, issues, "hugo-frontmatter", "Hugo content pages usually need frontmatter such as title, date, draft, tags, or description.");
      if (hasFrontmatter) {
        encourageFrontmatterField(frontmatterFields, ["title"], issues, "hugo-title", "Hugo content should include a title field.");
        encourageFrontmatterField(frontmatterFields, ["date"], issues, "hugo-date", "Add date frontmatter for list ordering, RSS, and archives.");
        addIf(frontmatterFields.get("draft") === "true", issues, "hugo-draft", "draft: true pages will not publish in normal Hugo builds.", "warn", 1);
      }
      addPatternIssue(markdown, RAW_HTML_PATTERN, issues, "hugo-raw-html", "Hugo Goldmark may omit raw HTML unless renderer.unsafe is enabled.", "warn");
      addPatternIssue(markdown, DOCUSAURUS_CONTAINER_PATTERN, issues, "hugo-container", "Docusaurus/VitePress containers need Hugo shortcodes or render hooks.", "warn");
      addPatternIssue(markdown, MKDOCS_ADMONITION_PATTERN, issues, "hugo-mkdocs", "MkDocs admonitions need Hugo shortcodes or a Markdown extension.", "warn");
      strengths.push(hasPattern(markdown, SHORTCODE_PATTERN) ? "Uses Hugo shortcode syntax." : "Goldmark/GFM content should transfer cleanly.");
      break;
    case "jekyll":
      encourageFrontmatter(hasFrontmatter, issues, "jekyll-frontmatter", "Jekyll pages and posts should start with YAML frontmatter.");
      if (hasFrontmatter) {
        encourageFrontmatterField(frontmatterFields, ["layout"], issues, "jekyll-layout", "Jekyll pages usually need a layout value unless defaults are configured.");
        encourageFrontmatterField(frontmatterFields, ["title"], issues, "jekyll-title", "Add title frontmatter for templates, SEO, and collections.");
      }
      addPatternIssue(markdown, DOCUSAURUS_CONTAINER_PATTERN, issues, "jekyll-container", "Docusaurus/VitePress containers need Liquid includes or a plugin in Jekyll.", "warn");
      addPatternIssue(markdown, MKDOCS_ADMONITION_PATTERN, issues, "jekyll-mkdocs", "MkDocs admonitions need a Jekyll plugin, include, or manual conversion.", "warn");
      addPatternIssue(markdown, SHORTCODE_PATTERN, issues, "jekyll-shortcode", "Hugo shortcodes do not work in Jekyll; use Liquid tags/includes instead.", "warn");
      if (hasPattern(markdown, LIQUID_PATTERN)) strengths.push("Uses Liquid tags or variables.");
      strengths.push("Jekyll profile checks frontmatter-first publishing flow.");
      break;
    case "astro":
      encourageFrontmatter(hasFrontmatter, issues, "astro-frontmatter", "Astro Markdown/MDX pages should expose title and description in frontmatter.");
      if (hasFrontmatter) {
        encourageFrontmatterField(frontmatterFields, ["title"], issues, "astro-title", "Astro content collections commonly require title.");
        encourageFrontmatterField(frontmatterFields, ["description"], issues, "astro-description", "Astro and Starlight pages should include description metadata.");
      }
      addPatternIssue(markdown, DOCUSAURUS_CONTAINER_PATTERN, issues, "astro-container", "Docusaurus containers need an Astro/Starlight component or remark plugin.", "warn");
      addPatternIssue(markdown, SHORTCODE_PATTERN, issues, "astro-shortcode", "Hugo shortcodes do not work in Astro content collections.", "warn");
      addPatternIssue(markdown, LOCAL_IMAGE_PATTERN, issues, "astro-local-image", "Astro image handling depends on whether this file lives in src content or public assets.", "info");
      if (hasPattern(markdown, MDX_IMPORT_EXPORT_PATTERN)) strengths.push("Uses MDX module syntax for Astro MDX.");
      strengths.push(hasPattern(markdown, JSX_OR_VUE_PATTERN) ? "Looks like MDX-style component content." : "Plain Markdown content is portable to Astro collections.");
      break;
    case "standard":
    default:
      if (!issues.length) strengths.push("No platform-specific restrictions enabled.");
      break;
  }

  return {
    issues: dedupeIssues(issues).slice(0, 8),
    profile: meta,
    score: scoreFromIssues(issues),
    strengths: strengths.slice(0, 4),
  };
}

function collectFences(markdown: string) {
  const fences: Array<{ language: string; line: number }> = [];
  let match: RegExpExecArray | null;
  FENCE_PATTERN.lastIndex = 0;
  while ((match = FENCE_PATTERN.exec(markdown))) {
    fences.push({ language: String(match[1] || "").trim().toLowerCase(), line: lineNumberAt(markdown, match.index) });
  }
  return fences;
}

function addRichFenceIssues(fences: Array<{ language: string; line: number }>, issues: ProfessionalIssue[], code: string, message: string, severity: ProfessionalSeverity) {
  for (const fence of fences) {
    if (MARCATO_RICH_FENCES.has(fence.language) || GITHUB_SUPPORTED_FENCES.has(fence.language)) {
      issues.push({ code, line: fence.line, message: `${fence.language || "Diagram"}: ${message}`, severity });
    }
  }
}

function addPatternIssue(markdown: string, pattern: RegExp, issues: ProfessionalIssue[], code: string, message: string, severity: ProfessionalSeverity) {
  pattern.lastIndex = 0;
  const match = pattern.exec(markdown);
  if (match) issues.push({ code, line: lineNumberAt(markdown, match.index), message, severity });
}

function hasPattern(markdown: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(markdown);
}

function addIf(condition: boolean, issues: ProfessionalIssue[], code: string, message: string, severity: ProfessionalSeverity, line?: number) {
  if (condition) issues.push({ code, line, message, severity });
}

function requireH1(markdown: string, issues: ProfessionalIssue[], message: string) {
  if (!/^#\s+\S/m.test(markdown)) issues.push({ code: "missing-title", message, severity: "warn" });
}

function encourageFrontmatter(hasFrontmatter: boolean, issues: ProfessionalIssue[], code: string, message: string) {
  if (!hasFrontmatter) issues.push({ code, message, severity: "info" });
}

function encourageFrontmatterField(fields: Map<string, string>, names: string[], issues: ProfessionalIssue[], code: string, message: string) {
  if (!names.some((name) => fields.has(name))) issues.push({ code, line: 1, message, severity: "info" });
}

function extractFrontmatterFields(markdown: string) {
  const fields = new Map<string, string>();
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) return fields;
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (field) fields.set(field[1].toLowerCase(), field[2].trim().replace(/^['"]|['"]$/g, ""));
  }
  return fields;
}

function lineNumberAt(value: string, index: number) {
  return value.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function scoreFromIssues(issues: ProfessionalIssue[]) {
  const penalty = issues.reduce((total, issue) => total + (issue.severity === "danger" ? 22 : issue.severity === "warn" ? 12 : 5), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function dedupeIssues(issues: ProfessionalIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}-${issue.line || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
