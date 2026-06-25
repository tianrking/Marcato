import katex from "katex";
import mermaid from "mermaid";
import { deflate } from "pako";
import L from "leaflet";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { setupDiagramActions } from "./diagramActions";

let mermaidReady = false;
const previewCleanups = new Map<HTMLElement, () => void>();
let graphvizInstance: Promise<import("@viz-js/viz").Viz> | null = null;
const REMOTE_DIAGRAM_ENGINES = [
  "plantuml",
  "d2",
  "vegalite",
  "vega-lite",
  "wavedrom",
  "markmap",
];

export async function postProcessPreview(root: HTMLElement, theme: "light" | "dark", offlineFirst: boolean) {
  renderMath(root);
  await renderMermaid(root, theme);
  await renderAbc(root);
  await renderLeafletMaps(root, theme);
  await renderGraphviz(root, theme);
  renderStl(root, theme);
  if (offlineFirst) renderRemoteDiagramFallbacks(root, "Offline-first is on. Remote rendering was skipped.");
  else await renderRemoteDiagrams(root);
  setupPreviewLinks(root);
}

export function disposePreviewResources(root?: HTMLElement) {
  for (const [node, cleanup] of previewCleanups) {
    if (root && node !== root && !root.contains(node) && node.isConnected) continue;
    cleanup();
    previewCleanups.delete(node);
  }
}

function registerPreviewCleanup(node: HTMLElement, cleanup: () => void) {
  previewCleanups.get(node)?.();
  previewCleanups.set(node, cleanup);
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

async function renderMermaid(root: HTMLElement, theme: "light" | "dark") {
  if (!mermaidReady) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "dark" ? "dark" : "default" });
    mermaidReady = true;
  }
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="mermaid"] .diagram-surface')];
  for (const node of nodes) {
    if (node.dataset.rendered === "1") continue;
    const code = decodeURIComponent(node.dataset.originalCode || "");
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const { svg } = await mermaid.render(id, code);
      node.innerHTML = svg;
      node.dataset.rendered = "1";
      markReady(node.closest<HTMLElement>(".diagram-viewer"));
    } catch (error) {
      markError(node.closest<HTMLElement>(".diagram-viewer"), error);
    }
  }
}

async function renderAbc(root: HTMLElement) {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="abc"] .diagram-surface')];
  if (nodes.length === 0) return;
  const abcjs = await import("abcjs");
  for (const node of nodes) {
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

async function renderLeafletMaps(root: HTMLElement, theme: "light" | "dark") {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="geojson"] .diagram-surface,.diagram-viewer[data-diagram-engine="topojson"] .diagram-surface')];
  if (nodes.length === 0) return;
  const topojson = await import("topojson-client");
  for (const node of nodes) {
    if (node.dataset.rendered === "1") return;
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const raw = JSON.parse(code);
      let data = raw;
      if (node.classList.contains("topojson")) {
        data = topojsonToFeatureCollection(topojson, raw);
      }
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

function renderStl(root: HTMLElement, theme: "light" | "dark") {
  root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="stl"] .diagram-surface').forEach((node) => {
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

async function renderGraphviz(root: HTMLElement, theme: "light" | "dark") {
  const nodes = [...root.querySelectorAll<HTMLElement>('.diagram-viewer[data-diagram-engine="graphviz"] .diagram-surface')];
  if (nodes.length === 0) return;
  const viz = await getGraphviz();
  for (const node of nodes) {
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

async function renderRemoteDiagrams(root: HTMLElement) {
  const nodes = [...root.querySelectorAll<HTMLElement>(remoteDiagramSelector())];
  for (const node of nodes) {
    if (node.dataset.rendered === "1") continue;
    const viewer = node.closest<HTMLElement>(".diagram-viewer");
    const engine = viewer?.dataset.diagramEngine || "";
    const code = decodeURIComponent(node.dataset.originalCode || "");
    try {
      const svg = await fetchRemoteSvg(engine, code);
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

function setupPreviewLinks(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (/^https?:\/\//i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
  setupDiagramActions(root, { registerCleanup: registerPreviewCleanup });
}

async function fetchRemoteSvg(engine: string, code: string) {
  const normalized = engine === "graphviz" ? "graphviz" : engine === "vega-lite" ? "vegalite" : engine;
  if (normalized === "plantuml") {
    const payload = encodePlantUml(code);
    const response = await fetch(`https://www.plantuml.com/plantuml/svg/${payload}`);
    if (!response.ok) throw new Error("PlantUML server rejected the diagram.");
    return await response.text();
  }
  const payload = bytesToBase64Url(deflate(new TextEncoder().encode(code), { level: 9 }));
  const response = await fetch(`https://kroki.io/${normalized}/svg/${payload}`);
  if (!response.ok) throw new Error("Kroki server rejected the diagram.");
  return await response.text();
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
