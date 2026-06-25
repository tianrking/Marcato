# MD Preview

React + TypeScript rewrite of `Markdown-Viewer`, built as an offline-first Markdown editing workspace.

## Features

- Multi-tab Markdown workspace with local persistence, rename, duplicate, close, reset, and per-tab undo/redo.
- Live split/editor/preview modes with draggable split layout, mobile layout, line numbers, stats, and synchronized scrolling.
- Worker-backed Markdown rendering with GFM, syntax highlighting, frontmatter tables, footnotes, definition lists, superscript, subscript, inline highlight, GitHub-style alerts, and sanitized HTML.
- Offline-first local rendering for LaTeX math through KaTeX, Mermaid, ABC notation, GeoJSON/TopoJSON summaries, and STL 3D previews.
- Remote adapters for PlantUML, D2, Graphviz, Vega-Lite, WaveDrom, and Markmap when offline-first mode is disabled.
- Formatting toolbar, smart list continuation, Tab indentation, alignment helpers, find/replace with regex/case/word/selection options and diff confirmation.
- Local file import, full-window drag and drop, GitHub repo/tree/blob/raw Markdown import, Markdown/HTML/PDF/PNG export, preview image copy, and pako-compressed share URLs.
- PWA build with generated service worker and local static resources.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

The current development server is expected at `http://127.0.0.1:5173/` when started with:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

## Notes

Most features work offline after the app is loaded. GitHub import and server-rendered diagram engines need network access by design.
