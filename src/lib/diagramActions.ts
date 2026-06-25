import { saveAs } from "file-saver";
import { copyPngBlobToClipboard, downloadBlob } from "./clipboardImages";

interface DiagramActionOptions {
  registerCleanup?: (node: HTMLElement, cleanup: () => void) => void;
}

export function setupDiagramActions(root: HTMLElement, options: DiagramActionOptions = {}) {
  root.querySelectorAll<HTMLElement>(".diagram-viewer").forEach((viewer) => {
    const toolbar = viewer.querySelector<HTMLElement>(".diagram-toolbar");
    const surface = viewer.querySelector<HTMLElement>(".diagram-surface");
    if (!toolbar || !surface || toolbar.dataset.ready === "1") return;

    let zoomCleanup: (() => void) | null = null;
    const actions = [
      makeToolButton("Copy PNG", () => copyDiagram(surface)),
      makeToolButton("SVG", () => downloadSvg(surface)),
      makeToolButton("PNG", () => downloadPng(surface)),
      makeToolButton("Zoom", () => {
        zoomCleanup?.();
        zoomCleanup = openZoom(surface);
      }),
    ];

    toolbar.dataset.ready = "1";
    toolbar.append(...actions.map((action) => action.button));
    options.registerCleanup?.(toolbar, () => {
      actions.forEach((action) => action.cleanup());
      zoomCleanup?.();
      zoomCleanup = null;
      delete toolbar.dataset.ready;
      toolbar.replaceChildren();
    });
  });
}

function makeToolButton(label: string, onClick: () => void | Promise<void>) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-button";
  button.textContent = label;
  const listener = () => void onClick();
  button.addEventListener("click", listener);
  return {
    button,
    cleanup: () => button.removeEventListener("click", listener),
  };
}

async function copyDiagram(surface: HTMLElement) {
  try {
    const blob = await renderSurfacePng(surface);
    if (blob) {
      if (await copyPngBlobToClipboard(blob)) return;
      downloadBlob(blob, `diagram-${Date.now()}.png`);
      return;
    }
  } catch {
    // Fall back to textual copy for browsers or diagrams that cannot be rasterized.
  }
  const svg = surface.querySelector("svg");
  const text = svg ? new XMLSerializer().serializeToString(svg) : surface.textContent || "";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back to downloading the diagram source.
  }
  saveAs(
    new Blob([text], { type: svg ? "image/svg+xml;charset=utf-8" : "text/plain;charset=utf-8" }),
    `diagram-${Date.now()}${svg ? ".svg" : ".txt"}`,
  );
}

function downloadSvg(surface: HTMLElement) {
  const svg = surface.querySelector("svg");
  const text = svg ? new XMLSerializer().serializeToString(svg) : surface.innerHTML;
  saveAs(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), `diagram-${Date.now()}.svg`);
}

async function downloadPng(surface: HTMLElement) {
  const blob = await renderSurfacePng(surface);
  if (blob) saveAs(blob, `diagram-${Date.now()}.png`);
}

async function renderSurfacePng(surface: HTMLElement) {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(surface, { backgroundColor: null, scale: 2, useCORS: true });
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

function openZoom(surface: HTMLElement) {
  const overlay = document.createElement("div");
  overlay.className = "zoom-overlay";
  const panel = document.createElement("div");
  panel.className = "zoom-panel";
  const header = document.createElement("div");
  header.className = "zoom-toolbar";
  const body = document.createElement("div");
  body.className = "zoom-body";
  const content = document.createElement("div");
  content.className = "zoom-content";
  content.append(surface.cloneNode(true));
  body.append(content);
  panel.append(header, body);
  overlay.append(panel);

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let disposed = false;

  const applyTransform = () => {
    content.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  };
  const setScale = (nextScale: number) => {
    scale = Math.min(8, Math.max(0.25, nextScale));
    applyTransform();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    closeButton.cleanup();
    zoomOut.cleanup();
    zoomIn.cleanup();
    reset.cleanup();
    body.removeEventListener("wheel", onWheel);
    body.removeEventListener("pointerdown", onPointerDown);
    overlay.removeEventListener("click", onOverlayClick);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    overlay.remove();
  };

  const closeButton = makeToolButton("Close", () => cleanup());
  const zoomOut = makeToolButton("-", () => setScale(scale / 1.2));
  const zoomIn = makeToolButton("+", () => setScale(scale * 1.2));
  const reset = makeToolButton("Reset", () => {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    applyTransform();
  });
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    setScale(scale * (event.deltaY > 0 ? 0.9 : 1.1));
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    offsetX += event.clientX - lastX;
    offsetY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    applyTransform();
  };
  const onPointerUp = () => {
    dragging = false;
    body.classList.remove("is-dragging");
  };
  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    body.classList.add("is-dragging");
    body.setPointerCapture(event.pointerId);
  };
  const onOverlayClick = (event: MouseEvent) => {
    if (event.target === overlay) cleanup();
  };

  header.append(zoomOut.button, zoomIn.button, reset.button, closeButton.button);
  overlay.addEventListener("click", onOverlayClick);
  body.addEventListener("wheel", onWheel, { passive: false });
  body.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  applyTransform();
  document.body.appendChild(overlay);
  return cleanup;
}
