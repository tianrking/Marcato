import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { copyPngBlobToClipboard } from "./clipboardImages";
import { assertPreviewRevision, downloadBlob, ensureExtension, exportHtml, exportMarkdown, waitForPreviewExportReady } from "./downloads";
import { stabilizeExportDomColors } from "./exportDom";
import { getExportName } from "./exportNames";
import { A4_PDF_CONFIG, estimatePdfPageCount, getPageHeightPx, preparePdfLayout } from "./pdfPagination";

export { getExportName };
export { exportHtml, exportMarkdown };
export type PdfExportPhase = "preparing" | "rendering" | "paginating" | "saving";

export interface PdfExportProgress {
  phase: PdfExportPhase;
  progress: number;
}

export interface PdfExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PdfExportProgress) => void;
}

export async function exportPng(filename: string, element: HTMLElement, expectedRevision?: string) {
  await waitForPreviewExportReady(element, 15_000, expectedRevision);
  assertPreviewRevision(element, expectedRevision);
  const exportElement = await createImageExportClone(element);
  try {
    const canvas = await html2canvas(exportElement, imageCanvasOptions());
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG export failed: canvas did not produce a blob.");
    downloadBlob(blob, ensureExtension(filename, ".png"));
  } finally {
    exportElement.remove();
  }
}

export async function exportPdf(filename: string, element: HTMLElement, options: PdfExportOptions = {}, expectedRevision?: string) {
  await waitForPreviewExportReady(element, 15_000, expectedRevision);
  document.documentElement.dataset.pdfRendering = "true";
  const runtimeStyle = installPdfRuntimeStyle();
  let exportElement: HTMLElement | null = null;
  try {
    reportPdfProgress(options, "preparing", 0.08);
    await nextAnimationFrame();
    assertPreviewRevision(element, expectedRevision);
    exportElement = await preparePdfLayout(element, A4_PDF_CONFIG, { signal: options.signal });
    throwIfAborted(options.signal);
    reportPdfProgress(options, "rendering", 0.34);
    throwIfAborted(options.signal);
    const canvas = await html2canvas(exportElement, {
      backgroundColor: "#ffffff",
      scale: choosePdfCanvasScale(exportElement),
      useCORS: true,
      allowTaint: false,
      logging: false,
      onclone: injectPdfCanvasStyles,
      windowWidth: Math.ceil(exportElement.getBoundingClientRect().width),
      windowHeight: Math.ceil(exportElement.getBoundingClientRect().height),
    });
    throwIfAborted(options.signal);
    reportPdfProgress(options, "paginating", 0.68);
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = A4_PDF_CONFIG.margin;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const scaleFactor = canvas.width / contentWidth;
    const sourcePageHeight = contentHeight * scaleFactor;
    const pagesCount = Math.max(1, Math.ceil((canvas.height - 1) / sourcePageHeight));

    for (let page = 0; page < pagesCount; page += 1) {
      throwIfAborted(options.signal);
      if (page > 0) pdf.addPage();
      const sourceY = Math.floor(page * sourcePageHeight);
      const sourceHeight = Math.min(canvas.height - sourceY, Math.ceil(sourcePageHeight));
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const context = pageCanvas.getContext("2d");
      if (context) context.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
      const imgData = pageCanvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", margin, margin, contentWidth, sourceHeight / scaleFactor);
      reportPdfProgress(options, "paginating", 0.68 + ((page + 1) / pagesCount) * 0.22);
    }

    throwIfAborted(options.signal);
    reportPdfProgress(options, "saving", 0.96);
    const blob = pdf.output("blob");
    downloadBlob(blob, ensureExtension(filename, ".pdf"));
    reportPdfProgress(options, "saving", 1);
  } finally {
    delete document.documentElement.dataset.pdfRendering;
    runtimeStyle.remove();
    exportElement?.remove();
  }
}

export async function inspectPdfPagination(element: HTMLElement) {
  const exportElement = await preparePdfLayout(element, A4_PDF_CONFIG);
  try {
    return {
      pageHeightPx: Math.round(getPageHeightPx(exportElement, A4_PDF_CONFIG)),
      estimatedPages: estimatePdfPageCount(exportElement, A4_PDF_CONFIG),
      spacers: exportElement.querySelectorAll(".pdf-page-break-spacer").length,
      splitTables: exportElement.querySelectorAll("table[data-pdf-split-part='true']").length,
      repeatedHeads: exportElement.querySelectorAll("table[data-pdf-split-part='true'] thead").length,
      height: Math.round(exportElement.getBoundingClientRect().height),
    };
  } finally {
    exportElement.remove();
  }
}

function choosePdfCanvasScale(element: HTMLElement) {
  const height = element.getBoundingClientRect().height;
  if (height > 9000) return 1.25;
  if (height > 5200) return 1.5;
  return 2;
}

function reportPdfProgress(options: PdfExportOptions, phase: PdfExportPhase, progress: number) {
  options.onProgress?.({ phase, progress: Math.min(1, Math.max(0, progress)) });
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("PDF export cancelled", "AbortError");
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function injectPdfCanvasStyles(documentClone: Document) {
  const style = documentClone.createElement("style");
  style.textContent = pdfRuntimeCss();
  documentClone.head.appendChild(style);
}

function installPdfRuntimeStyle() {
  const style = document.createElement("style");
  style.dataset.pdfRuntimeStyle = "true";
  style.textContent = pdfRuntimeCss();
  document.head.appendChild(style);
  return style;
}

function pdfRuntimeCss() {
  return `
    body,
    .preview-article,
    .preview-article *,
    .pdf-export,
    .pdf-export * {
      animation: none !important;
      background-image: none !important;
      box-shadow: none !important;
      filter: none !important;
      text-shadow: none !important;
      transition: none !important;
    }
    body {
      background: #ffffff !important;
    }
  `;
}

export type CopyImageResult = "copied" | "downloaded" | "unavailable";

export async function copyImage(element: HTMLElement, filename = "preview.png", expectedRevision?: string): Promise<CopyImageResult> {
  await waitForPreviewExportReady(element, 15_000, expectedRevision);
  assertPreviewRevision(element, expectedRevision);
  const exportElement = await createImageExportClone(element);
  try {
    const canvas = await html2canvas(exportElement, imageCanvasOptions());
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return "unavailable";
    if (await copyPngBlobToClipboard(blob)) return "copied";
    downloadBlob(blob, ensureExtension(filename, ".png"));
    return "downloaded";
  } finally {
    exportElement.remove();
  }
}

async function createImageExportClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  const bounds = source.getBoundingClientRect();
  clone.className = `${source.className} image-export`;
  clone.style.width = `${Math.max(1, Math.ceil(bounds.width))}px`;
  clone.style.maxWidth = "none";
  clone.style.position = "fixed";
  clone.style.left = "-10000px";
  clone.style.top = "0";
  clone.style.zIndex = "-1";
  clone.style.pointerEvents = "none";
  stabilizeExportDomColors(source, clone, { omitClasses: ["is-selected"] });
  copyCanvasPixels(elementCanvases(source), elementCanvases(clone));
  await rasterizeSvgs(source, clone);
  clone.querySelectorAll(".diagram-toolbar,.diagram-status,.mini-button,.leaflet-control-container").forEach((node) => node.remove());
  document.body.appendChild(clone);
  await nextAnimationFrame();
  return clone;
}

function elementCanvases(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLCanvasElement>("canvas")];
}

function copyCanvasPixels(sourceCanvases: HTMLCanvasElement[], cloneCanvases: HTMLCanvasElement[]) {
  sourceCanvases.forEach((canvas, index) => {
    const clone = cloneCanvases[index];
    if (!clone) return;
    clone.width = canvas.width;
    clone.height = canvas.height;
    clone.getContext("2d")?.drawImage(canvas, 0, 0);
  });
}

async function rasterizeSvgs(source: HTMLElement, clone: HTMLElement) {
  const sourceSvgs = [...source.querySelectorAll<SVGSVGElement>("svg")];
  const cloneSvgs = [...clone.querySelectorAll<SVGSVGElement>("svg")];
  for (const [index, cloneSvg] of cloneSvgs.entries()) {
    const svg = sourceSvgs[index];
    if (!svg) continue;
    const bounds = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const width = Math.max(1, Math.ceil(bounds.width || viewBox.width || svg.width.baseVal.value || 1));
    const height = Math.max(1, Math.ceil(bounds.height || viewBox.height || svg.height.baseVal.value || 1));
    const scale = Math.min(2, 4096 / width, 4096 / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    canvas.className = svg.getAttribute("class") || "";
    canvas.setAttribute("aria-label", svg.getAttribute("aria-label") || "Rendered diagram");
    canvas.style.cssText = cloneSvg.style.cssText;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const serializedSvg = svg.cloneNode(true) as SVGSVGElement;
    serializedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    serializedSvg.setAttribute("width", String(width));
    serializedSvg.setAttribute("height", String(height));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(serializedSvg)], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = await loadImage(url);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PNG export failed: canvas rendering is unavailable.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      cloneSvg.replaceWith(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("PNG export failed: an SVG could not be rasterized."));
    image.src = url;
  });
}

function imageCanvasOptions() {
  return {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    scale: 2,
    useCORS: true,
    logging: false,
  };
}
