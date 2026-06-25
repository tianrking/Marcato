# Markdown Viewer React Parity Checklist

This checklist tracks the React rewrite against the original `E:\MD_DIY\Markdown-Viewer`
implementation. Status values:

- `Done`: implemented and verified in the React app.
- `Partial`: present, but missing original details or production polish.
- `Missing`: not implemented yet.
- `Needs proof`: implemented-looking, but needs browser/PDF/mobile/export verification.

## Scope

The target is a pure web app. Desktop/Neutralino behavior is out of scope unless it has a
web-equivalent user value. Public-network rendering is allowed after the page loads, but editing
must remain smooth and predictable after initial access.

## Core Web Reliability

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| Web shortcuts do not steal browser tabs | Partial | `script.js` shortcut handling | `src/hooks/useGlobalShortcuts.ts` | Do not intercept Ctrl/Cmd+T or Ctrl/Cmd+W on the web. Keep app tab shortcuts on Alt+Shift variants. |
| Stable shortcut listener lifecycle | Partial | `script.js` global listeners | `src/hooks/useGlobalShortcuts.ts`, `src/App.tsx` | Avoid rebinding global keydown on every render; keep latest callbacks in refs. |
| Preview worker timeout cleanup | Partial | `script.js` worker fallback | `src/App.tsx` | Remove message listener on timeout and prevent stale rejections from leaking. |
| Preview post-process cancellation | Partial | original preview pipeline | `src/components/PreviewPane.tsx`, `src/lib/diagramRenderers.ts` | Async diagram rendering must stop writing after unmount or document change. |
| Preview resource scope | Partial | original cleanup helpers | `src/lib/diagramRenderers.ts` | Clean only current preview instance resources; no cross-preview global sweep surprises. |
| Main preview HTML sanitization | Done | `script.js sanitizePreviewHtml` | `src/lib/previewDocument.ts`, `src/lib/sanitizer.ts` | DOMPurify protects main Markdown HTML before `dangerouslySetInnerHTML`. |
| Post-process HTML sanitization | Partial | `script.js` diagram/link sanitizing | `src/lib/diagramRenderers.ts` | Sanitize or construct DOM nodes for Leaflet popups, remote SVG, fallbacks, toolbar HTML. |
| Safe links and anchor fallback | Partial | `script.js` preview link interception | `src/lib/diagramRenderers.ts` | Match original robust hash-anchor lookup and unsafe protocol blocking. |
| PWA/runtime cache rules | Partial | `index.html`, `sw.js`, `script.js` | `vite.config.ts` | Avoid catch-all caching overriding GitHub/diagram/map rules; verify update behavior. |

## Markdown Rendering

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| GFM basics | Needs proof | `preview-worker.js`, `script.js` | `src/lib/markdownCore.ts` | Verify tables, task lists, strikethrough, autolinks, headings. |
| Syntax highlighting | Needs proof | `preview-worker.js` | `src/lib/markdownCore.ts` | Verify common languages and plaintext fallback. |
| Frontmatter table | Partial | `script.js` frontmatter rendering | `src/lib/markdownCore.ts` | Original complex arrays/objects formatting is richer; verify parity. |
| Footnotes | Needs proof | `preview-worker.js` | `src/lib/markdownCore.ts` | Verify duplicate refs, backrefs, multiline definitions. |
| Definition lists | Needs proof | `preview-worker.js` | `src/lib/markdownCore.ts` | Verify nested/continuation behavior. |
| Superscript/subscript/highlight | Needs proof | `preview-worker.js` | `src/lib/markdownCore.ts` | Verify escaping and edge cases. |
| Math blocks and inline math | Needs proof | `preview-worker.js`, `script.js` | `src/lib/markdownCore.ts`, `src/lib/diagramRenderers.ts` | Verify escaped dollar handling and KaTeX error rendering. |
| GitHub alerts | Partial | `script.js enhanceGitHubAlerts`, `styles.css` | `src/lib/editorCommands.ts` | Rendering enhancement and styling parity still missing. |
| Segmented incremental preview | Partial | `script.js`, `preview-worker.js` | `src/lib/markdownCore.ts`, `src/components/PreviewPane.tsx` | Works, but renderer post-process is still imperative and can rerender too much. |

## Diagrams And Rich Blocks

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| Mermaid | Partial | `script.js` | `src/lib/diagramRenderers.ts` | Needs cancellation, SVG cleanup, dark-mode re-render proof, component migration. |
| ABC notation | Partial | `script.js` | `src/lib/diagramRenderers.ts` | Playback is basic; verify cleanup and no duplicate render calls. |
| GeoJSON/TopoJSON maps | Partial | `script.js` | `src/lib/diagramRenderers.ts` | Fix rendered-node loop bug; popup safety; multi-map verification. |
| STL viewer | Partial | `script.js`, `index.html`, `styles.css` | `src/lib/diagramRenderers.ts` | Missing modal, solid/angle/wireframe modes, fit/reset/copy parity. |
| Graphviz | Partial | `script.js`, `preview-worker.js` | `src/lib/diagramRenderers.ts` | Local render exists; needs dark-mode, export, natural sizing, error parity proof. |
| Vega-Lite | Partial | `script.js`, `preview-worker.js` | `src/lib/diagramRenderers.ts` | Local render exists; needs sizing/theme/export proof. |
| PlantUML | Partial | `script.js`, `preview-worker.js` | `src/lib/diagramRenderers.ts` | Needs original normalization, retry, PNG/SVG/export details. |
| D2 | Partial | `script.js`, `preview-worker.js` | `src/lib/diagramRenderers.ts` | Needs original normalization, retry, PNG/SVG/export details. |
| WaveDrom | Partial | `script.js`, `preview-worker.js` | `src/lib/diagramRenderers.ts` | Remote/fallback only; local rendering missing. |
| Markmap | Partial | `script.js`, `preview-worker.js` | `src/lib/diagramRenderers.ts` | Remote/fallback only; local SVG render missing. |
| Diagram toolbar | Partial | `index.html`, `script.js`, `styles.css` | `src/lib/diagramActions.ts` | Basic copy/SVG/PNG/zoom exists; missing original modal and remote-image PNG details. |
| Diagram templates modal | Missing | `index.html`, `script.js` | none | Need searchable categorized templates and insert flow. |

## Editing UX

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| Formatting toolbar | Partial | `index.html`, `script.js` | `src/App.tsx`, `src/lib/editorCommands.ts` | Core commands exist; several commands are simplified. |
| Link insert modal | Done | `index.html` link modal | `src/components/LinkInsertModal.tsx` | URL/text modal with selection replacement implemented. |
| Image insert modal | Done | `index.html` image modal | `src/components/ImageInsertModal.tsx` | URL, file embed, alt text, and selection replacement flow implemented. |
| Table insert modal | Done | `index.html` table modal | `src/components/TableInsertModal.tsx` | Rows, columns, and table-wide alignment insert flow implemented. |
| Reference insert modal | Done | `index.html` reference modal | `src/components/ReferenceInsertModal.tsx`, `src/lib/editorCommands.ts` | Scans used definitions, suggests the next number, inserts inline marker plus definition with optional title. |
| Emoji picker | Missing | `index.html`, `script.js` | none | Need GitHub emoji fetch/cache, skeleton, search, insert. |
| Symbols/entities picker | Done | `script.js` symbol groups | `src/components/SymbolsInsertModal.tsx` | Searchable grouped picker with multi-select, ordered entity insertion, and per-entity copy. |
| Alert insert UI | Partial | `index.html`, `script.js`, `styles.css` | `src/lib/editorCommands.ts` | Basic command exists; modal/grid/preview missing. |
| Smart enter/list continuation | Needs proof | `script.js` | `src/lib/editorCommands.ts` | Verify task/list/quote continuation and indentation edge cases. |
| Undo/redo history | Needs proof | `script.js` custom history | `src/stores/appStore.ts` | Verify multi-tab history, restore, and limits. |

## Tabs, Files, Import, Share

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| Multi-tab documents | Partial | `script.js`, `index.html` | `src/stores/appStore.ts`, `src/App.tsx` | Basic tabs; missing overflow, action menu, reorder, delete confirm, mobile tab list parity. |
| Drag/drop import | Needs proof | `script.js` | `src/App.tsx` | Verify multiple files, size limit, invalid files. |
| GitHub import | Partial | `index.html`, `script.js` | `src/components/GitHubImportModal.tsx` | Tree exists; skeleton/error/mobile/tooling parity incomplete. |
| Share view-only/edit links | Partial | `index.html`, `script.js` | `src/lib/share.ts`, `src/App.tsx` | Basic modes; verify view-only actually hides editor and large URL UX. |
| Export Markdown | Needs proof | `script.js` | `src/lib/exporters.ts` | Verify filename/title behavior. |
| Export HTML | Needs proof | `script.js` | `src/lib/exporters.ts` | Verify CSS, diagrams, sanitized HTML, standalone result. |
| Export PNG | Partial | `script.js` | `src/lib/exporters.ts`, `src/lib/diagramActions.ts` | Needs white/transparent background choices and remote image handling proof. |
| Export PDF | Partial | `script.js`, `styles.css` | `src/lib/pdfPagination.ts` | Pagination exists; needs original cascade/keep/table/page-edge proof. |

## Find, Preview Navigation, Health

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| Editor find/replace | Partial | `index.html`, `script.js` | `src/components/FindReplacePanel.tsx`, `src/lib/findReplace.ts` | Core exists; original history, diff modal, wrap UI, draggable panel not fully matched. |
| Preview find highlighting | Missing | `script.js` | none | Need preview-side highlight and navigation parity. |
| Synced scroll | Needs proof | `script.js` | `src/App.tsx` | Verify segmented preview and heading jumps. |
| Outline/TOC | Needs proof | `script.js` | `src/App.tsx`, `src/lib/markdownCore.ts` | Verify duplicate/non-Latin slugs and click behavior. |
| Document health | Partial | `index.html`, `script.js`, `styles.css` | `src/lib/documentHealth.ts`, `src/App.tsx` | Current panel is simplified; original modal/detail/mobile parity missing. |

## Internationalization And Responsive UI

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| 14-language coverage | Done | `index.html`, `script.js` | `src/lib/i18n.ts` | Covers en, zh, tw, ja, ko, pt, es, fr, de, ru, it, tr, pl, uk. |
| Browser language detection | Done | `script.js` | `src/lib/storage.ts` | Normalizes all supported base languages plus zh-Hant/tw. |
| Mobile menu | Missing | `index.html`, `styles.css`, `script.js` | responsive CSS only | Need original mobile action drawer/menu and mobile tabs. |
| Mobile tab list/actions | Missing | `index.html`, `script.js` | none | Need mobile tab list, duplicate/close/reset actions. |
| RTL/LTR behavior | Needs proof | `script.js`, `styles.css` | `src/App.tsx`, `src/components/WorkspaceToolbar.tsx` | Verify editor + preview + modals. |
| Modal responsive behavior | Partial | `styles.css` | `src/components/Common.tsx`, `src/styles.css` | Several original modals missing; current modal styles are minimal. |

## Style And Product Polish

| Area | Status | Original evidence | React evidence | Gap / acceptance |
| --- | --- | --- | --- | --- |
| Original visual density and states | Partial | `styles.css` | `src/styles.css` | Current styling is much smaller; add states for mobile, modals, diagram, print/PDF. |
| Accessibility announcements | Missing | `script.js` announcer | none | Need live region for copy/import/render/find actions. |
| Loading skeletons | Partial | `script.js`, `styles.css` | GitHub tree is basic | Need emoji/GitHub/diagram skeletons where original had them. |
| Error toasts and recovery | Partial | `script.js` | `src/App.tsx` | Standardize actionable errors and retry paths. |
| Bundle/performance budget | Partial | build output | Vite build | Split heavy diagram/render/export chunks; verify first-load size. |

## Verification Matrix

Each completed feature batch must include:

- `npm.cmd run lint`
- `npm.cmd run build`
- Browser smoke test for the touched workflow
- A focused commit message

High-risk browser smoke cases:

- Rapid edits while Mermaid/Vega/Graphviz/remote diagrams are rendering.
- Multiple GeoJSON/TopoJSON blocks in one document.
- Ctrl/Cmd+T and Ctrl/Cmd+W keep browser behavior.
- Alt+Shift+T and Alt+Shift+W control app tabs.
- View-only share URL hides editing controls.
- Mobile viewport opens all primary actions.
- Export PDF with long tables, headings near page breaks, diagrams, code blocks.
