export interface DiagramTemplate {
  category: string;
  description: string;
  engine: string;
  id: string;
  tags: string[];
  title: string;
  value: string;
}

export const DIAGRAM_TEMPLATE_CATEGORIES = [
  "All",
  "Mermaid",
  "Architecture",
  "Data",
  "Mind map",
  "Timing",
  "Music",
  "3D",
] as const;

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    id: "mermaid-flow",
    title: "Mermaid Flow",
    engine: "mermaid",
    category: "Mermaid",
    description: "A readable left-to-right decision flow.",
    tags: ["flowchart", "process", "decision"],
    value: `\`\`\`mermaid
flowchart LR
  A[Idea] --> B[Draft]
  B --> C{Ready?}
  C -- Yes --> D[Publish]
  C -- No --> B
\`\`\`
`,
  },
  {
    id: "mermaid-sequence",
    title: "Mermaid Sequence",
    engine: "mermaid",
    category: "Architecture",
    description: "Service interaction with request, validation, and response.",
    tags: ["sequence", "api", "service"],
    value: `\`\`\`mermaid
sequenceDiagram
  participant User
  participant Marcato
  participant Worker
  User->>Marcato: Edit Markdown
  Marcato->>Worker: Parse document
  Worker-->>Marcato: Preview blocks
  Marcato-->>User: Rendered preview
\`\`\`
`,
  },
  {
    id: "mermaid-gantt",
    title: "Mermaid Gantt",
    engine: "mermaid",
    category: "Mermaid",
    description: "Small release plan with active and future work.",
    tags: ["timeline", "release", "plan"],
    value: `\`\`\`mermaid
gantt
  title Marcato release plan
  dateFormat  YYYY-MM-DD
  section Core
  Parity audit      :done,    a1, 2026-06-20, 2d
  Mobile polish     :active,  a2, 2026-06-22, 3d
  Export hardening  :         a3, after a2, 2d
\`\`\`
`,
  },
  {
    id: "graphviz-pipeline",
    title: "Graphviz Pipeline",
    engine: "graphviz",
    category: "Architecture",
    description: "A compact directed system pipeline.",
    tags: ["dot", "pipeline", "system"],
    value: `\`\`\`dot
digraph G {
  rankdir=LR;
  node [shape=box, style="rounded,filled", fillcolor="#f8fafc"];
  Editor -> Worker -> Preview -> Export;
  Preview -> Share;
}
\`\`\`
`,
  },
  {
    id: "plantuml-sequence",
    title: "PlantUML Sequence",
    engine: "plantuml",
    category: "Architecture",
    description: "Remote-rendered PlantUML sequence starter.",
    tags: ["plantuml", "sequence", "remote"],
    value: `\`\`\`plantuml
@startuml
actor User
participant Marcato
participant Renderer
User -> Marcato: write markdown
Marcato -> Renderer: render diagram
Renderer --> Marcato: safe SVG
Marcato --> User: preview
@enduml
\`\`\`
`,
  },
  {
    id: "d2-system",
    title: "D2 System Map",
    engine: "d2",
    category: "Architecture",
    description: "Clean D2 nodes for a web app system map.",
    tags: ["d2", "system", "remote"],
    value: `\`\`\`d2
Marcato: {
  Editor
  Worker
  Preview
  Export
}
Editor -> Worker: markdown
Worker -> Preview: blocks
Preview -> Export: html
\`\`\`
`,
  },
  {
    id: "vegalite-bars",
    title: "Vega-Lite Bars",
    engine: "vega-lite",
    category: "Data",
    description: "Tiny bar chart for metrics or comparisons.",
    tags: ["chart", "data", "bars"],
    value: `\`\`\`vega-lite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "data": {
    "values": [
      { "label": "Write", "value": 42 },
      { "label": "Preview", "value": 68 },
      { "label": "Export", "value": 31 }
    ]
  },
  "mark": { "type": "bar", "cornerRadiusEnd": 4 },
  "encoding": {
    "x": { "field": "label", "type": "nominal" },
    "y": { "field": "value", "type": "quantitative" },
    "color": { "field": "label", "type": "nominal", "legend": null }
  }
}
\`\`\`
`,
  },
  {
    id: "markmap-roadmap",
    title: "Markmap Roadmap",
    engine: "markmap",
    category: "Mind map",
    description: "Markdown-native mind map starter.",
    tags: ["mindmap", "outline", "roadmap"],
    value: `\`\`\`markmap
# Marcato
## Writing
- Markdown
- Math
- Diagrams
## Sharing
- Read-only links
- Editable links
## Export
- HTML
- PDF
- PNG
\`\`\`
`,
  },
  {
    id: "wavedrom-bus",
    title: "WaveDrom Bus",
    engine: "wavedrom",
    category: "Timing",
    description: "Digital timing diagram with clock, request, and data bus.",
    tags: ["timing", "waveform", "hardware"],
    value: `\`\`\`wavedrom
{ signal: [
  { name: "clk",  wave: "p....." },
  { name: "req",  wave: "01.0.." },
  { name: "data", wave: "x.345x", data: ["A", "B", "C"] }
] }
\`\`\`
`,
  },
  {
    id: "abc-tune",
    title: "ABC Tune",
    engine: "abc",
    category: "Music",
    description: "Small ABC notation melody with title and meter.",
    tags: ["music", "score", "abc"],
    value: `\`\`\`abc
X:1
T:Marcato Motif
M:4/4
L:1/8
K:C
CDEF G2 G2 | A2 A2 G4 |
\`\`\`
`,
  },
  {
    id: "geojson-point",
    title: "GeoJSON Point",
    engine: "geojson",
    category: "Data",
    description: "A map point with safe feature properties.",
    tags: ["map", "geojson", "leaflet"],
    value: `\`\`\`geojson
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Marcato" },
      "geometry": { "type": "Point", "coordinates": [-74.006, 40.7128] }
    }
  ]
}
\`\`\`
`,
  },
  {
    id: "stl-cube",
    title: "ASCII STL Cube",
    engine: "stl",
    category: "3D",
    description: "Minimal ASCII STL triangle, useful for checking 3D preview.",
    tags: ["stl", "3d", "mesh"],
    value: `\`\`\`stl
solid marcato
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid marcato
\`\`\`
`,
  },
];
