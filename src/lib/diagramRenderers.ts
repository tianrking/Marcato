import katex from "katex";
import mermaid from "mermaid";
import { deflate } from "pako";
import L from "leaflet";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { setupDiagramActions } from "./diagramActions";
import { loadGitHubEmojis } from "./githubEmojis";
import { setupPreviewLinks } from "./previewLinks";
import { sanitizeRemoteDiagramSvg } from "./sanitizer";
import type { TopLevelSpec } from "vega-lite";

let mermaidReady = false;
const previewCleanups = new Map<HTMLElement, () => void>();
let graphvizInstance: Promise<import("@viz-js/viz").Viz> | null = null;
const remoteSvgCache = new Map<string, string>();
const remoteSvgRequests = new Map<string, Promise<string>>();
const REMOTE_DIAGRAM_ENGINES = [
  "plantuml",
  "d2",
];

export async function postProcessPreview(root: HTMLElement, theme: "light" | "dark", offlineFirst: boolean, signal?: AbortSignal) {
  if (isAborted(signal, root)) return;
  renderMath(root);
  if (isAborted(signal, root)) return;
  await renderEmojiShortcodes(root, signal);
  if (isAborted(signal, root)) return;
  await renderMermaid(root, theme, signal);
  if (isAborted(signal, root)) return;
  await renderAbc(root, signal);
  if (isAborted(signal, root)) return;
  await renderLeafletMaps(root, theme, signal);
  if (isAborted(signal, root)) return;
  await renderGraphviz(root, theme, signal);
  if (isAborted(signal, root)) return;
  await renderVegaLite(root, theme, signal);
  if (isAborted(signal, root)) return;
  await renderWaveDrom(root, signal);
  if (isAborted(signal, root)) return;
  await renderMarkmap(root, theme, signal);
  if (isAborted(signal, root)) return;
  renderStl(root, theme, signal);
  if (isAborted(signal, root)) return;
  if (offlineFirst) renderRemoteDiagramFallbacks(root, "Offline-first is on. Remote rendering was skipped.");
  else await renderRemoteDiagrams(root, signal);
  if (isAborted(signal, root)) return;
  setupPreviewLinks(root);
  setupDiagramActions(root, { registerCleanup: registerPreviewCleanup });
}

export function disposePreviewResources(root?: HTMLElement) {
  for (const [node, cleanup] of previewCleanups) {
    if (root && node !== root && !root.contains(node)) continue;
    cleanup();
    previewCleanups.delete(node);
  }
}

function registerPreviewCleanup(node: HTMLElement, cleanup: () => void) {
  previewCleanups.get(node)?.();
  previewCleanups.set(node, cleanup);
}

function isAborted(signal: AbortSignal | undefined, root: HTMLElement) {
  return Boolean(signal?.aborted || !root.isConnected);
}

function renderMath(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".math-inline,.math-block").forEach((node) => {
    if (node.dataset.rendered === "1") return;
    const tex = node.dataset.tex || node.textContent?.replace(/^\$\$?|\$\$?$/g, "") || "";
    try {
      katex.render(tex, node, {
        displayMode: node.classList.contains("math-block"),
        throwOnError: false,
        output: "html",
      });
      node.dataset.rendered = "1";
    } catch (error) {
      node.textContent = error instanceof Error ? error.message : "Math render failed";
      node.classList.add("render-error");
    }
  });
}

async function renderEmojiShortcodes(root: HTMLElement, signal?: AbortSignal) {
  if (!root.textContent?.includes(":")) return;
  let emojis: Map<string, string>;
  try {
    const entries = await loadGitHubEmojis();
    emojis = new Map(entries.map((entry) => [entry.name, entry.url]));
  } catch {
    return;
  }
  if (isAborted(signal, root) || emojis.size === 0) return;

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || !node.nodeValue?.includes(":")) continue;
    if (parent.closest("a,button,code,pre,script,style,textarea,mjx-container")) continue;
    nodes.push(node);
  }

  const shortcodePattern = /:([a-z0-9_+-]+):/gi;
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    const text = node.nodeValue || "";
    shortcodePattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    while ((match = shortcodePattern.exec(text)) !== null) {
      const url = emojis.get(match[1].toLowerCase());
      if (!url) continue;
      const before = text.slice(lastIndex, match.index);
      if (before) fragment.appendChild(document.createTextNode(before));
      const shortcode = match[0];
      const image = document.createElement("img");
      image.className = "preview-emoji";
      image.src = url;
      image.alt = shortcode;
      image.title = shortcode;
      image.loading = "lazy";
      fragment.appendChild(image);
      lastIndex = match.index + shortcode.length;
      changed = true;
    }
    if (!changed) continue;
    const after = text.slice(lastIndex);
    if (after) fragment.appendChild(document.createTextNode(after));
    node.replaceWith(fragment);
  }
}

async function renderMermaid(root: HTMLElement, theme: "light" | "dark", signal?: AbortSignal) {
  if (!mermaidReady) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "dark" ? "dark" : "default" });
    mermaidReady = true;
  }
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="mermaid"] .diagram-surface')];
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const code = decodeURIComponent(node.dataset.originalCode || "");
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const { svg } = await mermaid.render(id, code);
      if (isAborted(signal, root) || !node.isConnected) return;
      node.innerHTML = svg;
      node.dataset.rendered = "1";
      markReady(node.closest<HTMLElement>(".diagram-viewer"));
    } catch (error) {
      markError(node.closest<HTMLElement>(".diagram-viewer"), error);
    }
  }
}

async function renderAbc(root: HTMLElement, signal?: AbortSignal) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="abc"] .diagram-surface')];
  if (nodes.length === 0) return;
  const abcjs = await import("abcjs");
  if (isAborted(signal, root)) return;
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      node.innerHTML = "";
      abcjs.renderAbc(node, code, { responsive: "resize", add_classes: true });
      const play = document.createElement("button");
      play.type = "button";
      play.textContent = "Play";
      play.className = "mini-button";
      play.addEventListener("click", async () => {
        const synth = new abcjs.synth.CreateSynth();
        const visualObj = abcjs.renderAbc(node, code)[0];
        await synth.init({ visualObj });
        await synth.prime();
        synth.start();
      });
      node.prepend(play);
      node.dataset.rendered = "1";
      markReady(node.closest<HTMLElement>(".diagram-viewer"));
    } catch (error) {
      markError(node.closest<HTMLElement>(".diagram-viewer"), error);
    }
  }
}

async function renderLeafletMaps(root: HTMLElement, theme: "light" | "dark", signal?: AbortSignal) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="geojson"] .diagram-surface,.diagram-viewer[data-diagram-engine="topojson"] .diagram-surface')];
  if (nodes.length === 0) return;
  const topojson = await import("topojson-client");
  if (isAborted(signal, root)) return;
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const raw = JSON.parse(code);
      let data = raw;
      if (node.classList.contains("topojson")) {
        data = topojsonToFeatureCollection(topojson, raw);
      }
      if (isAborted(signal, root) || !node.isConnected) return;
      node.innerHTML = "";
      const mapElement = document.createElement("div");
      mapElement.className = "leaflet-map-canvas";
      node.appendChild(mapElement);
      const map = L.map(mapElement, {
        attributionControl: true,
        scrollWheelZoom: true,
      });
      L.tileLayer(tileUrl(theme), {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);
      const layer = L.geoJSON(data, {
        style: {
          color: theme === "dark" ? "#38bdf8" : "#2563eb",
          fillColor: theme === "dark" ? "#22d3ee" : "#60a5fa",
          fillOpacity: 0.22,
          opacity: 0.92,
          weight: 2,
        },
        pointToLayer(feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 7,
            color: theme === "dark" ? "#2dd4bf" : "#0f766e",
            fillColor: theme === "dark" ? "#5eead4" : "#14b8a6",
            fillOpacity: 0.72,
            weight: 2,
          }).bindPopup(featurePopup(feature.properties));
        },
        onEachFeature(feature, layer) {
          if (feature.properties) layer.bindPopup(featurePopup(feature.properties));
        },
      }).addTo(map);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.12), { maxZoom: 12 });
      else map.setView([20, 0], 2);
      window.setTimeout(() => map.invalidateSize(), 0);
      registerPreviewCleanup(node, () => {
        map.remove();
        delete node.dataset.rendered;
        node.innerHTML = "";
      });
      node.dataset.rendered = "1";
      markReady(node.closest<HTMLElement>(".diagram-viewer"));
    } catch (error) {
      markError(node.closest<HTMLElement>(".diagram-viewer"), error);
    }
  }
}

function topojsonToFeatureCollection(topojson: typeof import("topojson-client"), topology: any) {
  const objects = topology?.objects && typeof topology.objects === "object" ? Object.values(topology.objects) : [];
  const features = objects.flatMap((object) => {
    const converted = topojson.feature(topology, object) as any;
    if (converted?.type === "FeatureCollection") return converted.features || [];
    return converted ? [converted] : [];
  });
  return { type: "FeatureCollection", features };
}

function tileUrl(theme: "light" | "dark") {
  if (theme === "dark") return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  return "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
}

function featurePopup(properties: unknown) {
  if (!properties || typeof properties !== "object") return "Feature";
  const rows = Object.entries(properties as Record<string, unknown>)
    .slice(0, 12)
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value ?? ""))}</td></tr>`)
    .join("");
  return rows ? `<table class="leaflet-popup-table"><tbody>${rows}</tbody></table>` : "Feature";
}

function renderStl(root: HTMLElement, theme: "light" | "dark", signal?: AbortSignal) {
  root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="stl"] .diagram-surface').forEach((node) => {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") return;
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      node.innerHTML = "";
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(theme === "dark" ? 0x0f172a : 0xf8fafc);
      const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
      camera.position.set(0, 0, 80);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(640, 400);
      renderer.domElement.className = "stl-canvas";
      node.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
      const loader = new STLLoader();
      const geometry = loader.parse(new TextEncoder().encode(code).buffer);
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({ color: theme === "dark" ? 0x94a3b8 : 0x2563eb, metalness: 0.15, roughness: 0.55 });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      const radius = geometry.boundingSphere?.radius || 40;
      camera.position.z = radius * 2.8;
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      let animationFrame = 0;
      const animate = () => {
        if (!node.isConnected) return;
        controls.update();
        renderer.render(scene, camera);
        animationFrame = requestAnimationFrame(animate);
      };
      animate();
      registerPreviewCleanup(node, () => {
        cancelAnimationFrame(animationFrame);
        controls.dispose();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        delete node.dataset.rendered;
        node.innerHTML = "";
      });
      node.dataset.rendered = "1";
      markReady(node.closest<HTMLElement>(".diagram-viewer"));
    } catch (error) {
      markError(node.closest<HTMLElement>(".diagram-viewer"), error);
    }
  });
}

async function renderGraphviz(root: HTMLElement, theme: "light" | "dark", signal?: AbortSignal) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="graphviz"] .diagram-surface')];
  if (nodes.length === 0) return;
  const viz = await getGraphviz();
  if (isAborted(signal, root)) return;
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const viewer = node.closest<HTMLElement>(".diagram-viewer");
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const svg = viz.renderSVGElement(code, {
        engine: "dot",
        graphAttributes: {
          bgcolor: "transparent",
          color: theme === "dark" ? "#94a3b8" : "#64748b",
          fontcolor: theme === "dark" ? "#e6edf3" : "#172033",
        },
        nodeAttributes: {
          color: theme === "dark" ? "#60a5fa" : "#2563eb",
          fontcolor: theme === "dark" ? "#e6edf3" : "#172033",
          fontname: "Inter, Segoe UI, Arial",
          style: "rounded,filled",
          fillcolor: theme === "dark" ? "#20242d" : "#f8fafc",
        },
        edgeAttributes: {
          color: theme === "dark" ? "#2dd4bf" : "#0f766e",
          fontcolor: theme === "dark" ? "#e6edf3" : "#172033",
        },
      });
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Graphviz diagram");
      if (isAborted(signal, root) || !node.isConnected) return;
      node.replaceChildren(svg);
      node.dataset.rendered = "1";
      markReady(viewer);
    } catch (error) {
      markDiagramFallback(viewer, node, "graphviz", error instanceof Error ? error.message : "Local Graphviz render failed");
    }
  }
}

async function getGraphviz() {
  graphvizInstance ||= import("@viz-js/viz").then(({ instance }) => instance());
  return await graphvizInstance;
}

async function renderVegaLite(root: HTMLElement, theme: "light" | "dark", signal?: AbortSignal) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="vegalite"] .diagram-surface,.diagram-viewer[data-diagram-engine="vega-lite"] .diagram-surface')];
  if (nodes.length === 0) return;
  const [{ compile }, vega] = await Promise.all([import("vega-lite"), import("vega")]);
  if (isAborted(signal, root)) return;
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const viewer = node.closest<HTMLElement>(".diagram-viewer");
    const engine = viewer?.dataset.diagramEngine || "vegalite";
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const spec = JSON.parse(code) as Record<string, unknown>;
      const compiled = compile(withVegaLiteTheme(spec, theme) as TopLevelSpec).spec;
      const view = new vega.View(vega.parse(compiled), {
        renderer: "none",
      }).initialize();
      const svg = await view.toSVG().finally(() => view.finalize());
      if (isAborted(signal, root) || !node.isConnected) return;
      node.innerHTML = svg;
      node.dataset.rendered = "1";
      markReady(viewer);
    } catch (error) {
      markDiagramFallback(viewer, node, engine, error instanceof Error ? error.message : "Local Vega-Lite render failed");
    }
  }
}

function withVegaLiteTheme(spec: Record<string, unknown>, theme: "light" | "dark") {
  const userConfig = isRecord(spec.config) ? spec.config : {};
  const axisColor = theme === "dark" ? "#9aa7b7" : "#64748b";
  const textColor = theme === "dark" ? "#e6edf3" : "#172033";
  return {
    ...spec,
    background: spec.background ?? "transparent",
    config: {
      view: { stroke: "transparent" },
      axis: { domainColor: axisColor, gridColor: theme === "dark" ? "#303744" : "#d7dee9", labelColor: textColor, tickColor: axisColor, titleColor: textColor },
      legend: { labelColor: textColor, titleColor: textColor },
      title: { color: textColor, subtitleColor: axisColor },
      ...(userConfig as Record<string, unknown>),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function renderMarkmap(root: HTMLElement, theme: "light" | "dark", signal?: AbortSignal) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="markmap"] .diagram-surface')];
  if (nodes.length === 0) return;
  const [{ Transformer }, { Markmap }] = await Promise.all([import("markmap-lib"), import("markmap-view")]);
  if (isAborted(signal, root)) return;
  const transformer = new Transformer();
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const viewer = node.closest<HTMLElement>(".diagram-viewer");
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const { root: markmapRoot } = transformer.transform(code);
      if (isAborted(signal, root) || !node.isConnected) return;
      node.innerHTML = "";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("markmap-svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Markmap diagram");
      svg.setAttribute("width", String(Math.max(640, Math.round(node.clientWidth || 720))));
      svg.setAttribute("height", "420");
      svg.style.width = "100%";
      svg.style.minHeight = "320px";
      node.appendChild(svg);
      const markmap = Markmap.create(svg, {
        autoFit: true,
        duration: 0,
        embedGlobalCSS: true,
        initialExpandLevel: 8,
        maxWidth: 280,
        pan: true,
        zoom: true,
        color: () => theme === "dark" ? "#60a5fa" : "#2563eb",
      }, markmapRoot);
      await markmap.fit();
      if (isAborted(signal, root) || !node.isConnected) {
        markmap.destroy();
        return;
      }
      registerPreviewCleanup(node, () => {
        markmap.destroy();
        delete node.dataset.rendered;
        node.innerHTML = "";
      });
      node.dataset.rendered = "1";
      markReady(viewer);
    } catch (error) {
      markDiagramFallback(viewer, node, "markmap", error instanceof Error ? error.message : "Local Markmap render failed");
    }
  }
}

async function renderWaveDrom(root: HTMLElement, signal?: AbortSignal) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="wavedrom"] .diagram-surface')];
  if (nodes.length === 0) return;
  const [{ default: JSON5 }, renderAnyModule, waveSkinModule, stringifyModule] = await Promise.all([
    import("json5"),
    import("wavedrom-render-any"),
    import("wavedrom/skins/default.js"),
    import("onml/stringify.js"),
  ]);
  if (isAborted(signal, root)) return;

  const renderAny = renderAnyModule.default;
  const waveSkin = normalizeWaveDromSkin(waveSkinModule.default);
  const stringify = stringifyModule.default;

  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const viewer = node.closest<HTMLElement>(".diagram-viewer");
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const source = JSON5.parse(code) as unknown;
      if (!isWaveDromSource(source)) throw new Error("WaveDrom source must include signal, assign, or reg data.");
      const tree = renderAny(0, source, waveSkin);
      const svg = sanitizeRemoteDiagramSvg(stringify(tree));
      if (isAborted(signal, root) || !node.isConnected) return;
      node.innerHTML = svg;
      const svgElement = node.querySelector<SVGSVGElement>("svg");
      if (!svgElement) throw new Error("WaveDrom renderer did not create an SVG.");
      svgElement.classList.add("wavedrom-svg");
      svgElement.setAttribute("role", "img");
      svgElement.setAttribute("aria-label", "WaveDrom timing diagram");
      svgElement.style.maxWidth = "100%";
      svgElement.style.height = "auto";
      registerPreviewCleanup(node, () => {
        delete node.dataset.rendered;
        node.innerHTML = "";
      });
      node.dataset.rendered = "1";
      markReady(viewer);
    } catch (error) {
      markDiagramFallback(viewer, node, "wavedrom", error instanceof Error ? error.message : "Local WaveDrom render failed");
    }
  }
}

function isWaveDromSource(source: unknown): source is Record<string, unknown> {
  if (!isRecord(source)) return false;
  return Array.isArray(source.signal) || Array.isArray(source.assign) || Array.isArray(source.reg);
}

function normalizeWaveDromSkin(value: { default?: unknown }) {
  const maybeWrapped = isRecord(value.default) ? value.default : value;
  if (!Array.isArray(maybeWrapped.default)) throw new Error("WaveDrom default skin is unavailable.");
  return maybeWrapped;
}

async function renderRemoteDiagrams(root: HTMLElement, signal?: AbortSignal) {
  const nodes = [...root.querySelectorAll<HTMLElement>(remoteDiagramSelector())];
  for (const node of nodes) {
    if (isAborted(signal, root)) return;
    if (node.dataset.rendered === "1") continue;
    const viewer = node.closest<HTMLElement>(".diagram-viewer");
    const engine = viewer?.dataset.diagramEngine || "";
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const svg = await fetchRemoteSvgCached(engine, code);
      if (isAborted(signal, root) || !node.isConnected) return;
      node.innerHTML = svg;
      node.dataset.rendered = "1";
      markReady(viewer);
    } catch (error) {
      markDiagramFallback(viewer, node, engine, error instanceof Error ? error.message : "Remote render failed");
    }
  }
}

function renderRemoteDiagramFallbacks(root: HTMLElement, reason: string) {
  const nodes = [...root.querySelectorAll<HTMLElement>(remoteDiagramSelector())];
  nodes.forEach((node) => {
    if (node.dataset.rendered === "1") return;
    const viewer = node.closest<HTMLElement>(".diagram-viewer");
    const engine = viewer?.dataset.diagramEngine || "diagram";
    markDiagramFallback(viewer, node, engine, reason);
  });
}

function remoteDiagramSelector() {
  return REMOTE_DIAGRAM_ENGINES.map((engine) => `.diagram-viewer[data-diagram-engine="${engine}"] .diagram-surface`).join(",");
}

async function fetchRemoteSvgCached(engine: string, code: string) {
  const normalizedCode = normalizeRemoteDiagramCode(engine, code);
  const key = `${engine}\n${normalizedCode}`;
  const cached = remoteSvgCache.get(key);
  if (cached) return cached;
  const existing = remoteSvgRequests.get(key);
  if (existing) return await existing;
  const request = fetchRemoteSvg(engine, normalizedCode)
    .then((svg) => sanitizeRemoteDiagramSvg(svg))
    .then((safeSvg) => {
      remoteSvgCache.set(key, safeSvg);
      if (remoteSvgCache.size > 80) {
        const oldestKey = remoteSvgCache.keys().next().value;
        if (oldestKey) remoteSvgCache.delete(oldestKey);
      }
      return safeSvg;
    })
    .finally(() => remoteSvgRequests.delete(key));
  remoteSvgRequests.set(key, request);
  return await request;
}

async function fetchRemoteSvg(engine: string, code: string) {
  const normalized = engine === "graphviz" ? "graphviz" : engine === "vega-lite" ? "vegalite" : engine;
  if (normalized === "plantuml") {
    const payload = encodePlantUml(code);
    return await fetchTextWithRetry([
      `https://www.plantuml.com/plantuml/svg/${payload}`,
      `https://plantuml.com/plantuml/svg/${payload}`,
    ], "PlantUML server rejected the diagram.");
  }
  const payload = bytesToBase64Url(deflate(new TextEncoder().encode(code), { level: 9 }));
  return await fetchTextWithRetry([`https://kroki.io/${normalized}/svg/${payload}`], "Kroki server rejected the diagram.");
}

export function normalizeRemoteDiagramCode(engine: string, code: string) {
  const trimmed = code.replace(/\r\n/g, "\n").trim();
  if (!trimmed) throw new Error("Diagram source is empty.");
  if (engine === "plantuml") {
    const hasStart = /^@start\w*/im.test(trimmed);
    const hasEnd = /^@end\w*/im.test(trimmed);
    if (hasStart && hasEnd) return trimmed;
    if (hasStart) return `${trimmed}\n@enduml`;
    if (hasEnd) return `@startuml\n${trimmed}`;
    return `@startuml\n${trimmed}\n@enduml`;
  }
  if (engine === "d2") {
    const normalized = trimmed
      .replace(/^```(?:d2)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (!normalized) throw new Error("Diagram source is empty.");
    return normalized;
  }
  return trimmed;
}

async function fetchTextWithRetry(urls: string[], message: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) return await response.text();
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt === 0) await delay(300);
  }
  const suffix = lastError instanceof Error ? ` ${lastError.message}` : "";
  throw new Error(`${message}${suffix}`);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function markReady(viewer: HTMLElement | null) {
  if (!viewer) return;
  viewer.classList.remove("is-loading");
  viewer.classList.remove("is-error");
  const status = viewer.querySelector<HTMLElement>(".diagram-status");
  if (status) status.textContent = "Ready";
}

function markError(viewer: HTMLElement | null, error: unknown) {
  if (!viewer) return;
  viewer.classList.remove("is-loading");
  viewer.classList.add("is-error");
  const status = viewer.querySelector<HTMLElement>(".diagram-status");
  if (status) status.textContent = error instanceof Error ? error.message : "Render failed";
}

function markDiagramFallback(viewer: HTMLElement | null, surface: HTMLElement, engine: string, reason: string) {
  if (!viewer) return;
  const code = decodeURIComponent(surface.dataset.originalCode || "");
  viewer.classList.remove("is-loading");
  viewer.classList.remove("is-error");
  viewer.classList.add("is-fallback");
  surface.classList.add("diagram-fallback");
  surface.innerHTML =
    `<div class="diagram-fallback-note"><strong>${escapeHtml(diagramLabel(engine))} source preview</strong><span>${escapeHtml(reason)}</span></div>` +
    `<pre><code>${escapeHtml(code)}</code></pre>`;
  surface.dataset.rendered = "1";
  const status = viewer.querySelector<HTMLElement>(".diagram-status");
  if (status) status.textContent = "Source preview";
}

function diagramLabel(engine: string) {
  const labels: Record<string, string> = {
    plantuml: "PlantUML",
    d2: "D2",
    graphviz: "Graphviz",
    vegalite: "Vega-Lite",
    "vega-lite": "Vega-Lite",
    wavedrom: "WaveDrom",
    markmap: "Markmap",
  };
  return labels[engine] || engine || "Diagram";
}

function encodePlantUml(text: string) {
  const data = deflate(new TextEncoder().encode(text), { level: 9, raw: true });
  let result = "";
  for (let index = 0; index < data.length; index += 3) {
    if (index + 2 === data.length) result += append3bytes(data[index], data[index + 1], 0);
    else if (index + 1 === data.length) result += append3bytes(data[index], 0, 0);
    else result += append3bytes(data[index], data[index + 1], data[index + 2]);
  }
  return result;
}

function append3bytes(b1: number, b2: number, b3: number) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
}

function encode6bit(value: number) {
  if (value < 10) return String.fromCharCode(48 + value);
  value -= 10;
  if (value < 26) return String.fromCharCode(65 + value);
  value -= 26;
  if (value < 26) return String.fromCharCode(97 + value);
  value -= 26;
  if (value === 0) return "-";
  if (value === 1) return "_";
  return "?";
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
