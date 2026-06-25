import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { copyPngBlobToClipboard, downloadBlob } from "./clipboardImages";
import { getExportName } from "./exportNames";
import { A4_PDF_CONFIG, estimatePdfPageCount, getPageHeightPx, preparePdfLayout } from "./pdfPagination";

export { getExportName };
export type PdfExportPhase = "preparing" | "rendering" | "paginating" | "saving";

export interface PdfExportProgress {
  phase: PdfExportPhase;
  progress: number;
}

export interface PdfExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PdfExportProgress) => void;
}

export function exportMarkdown(filename: string, content: string) {
  saveAs(new Blob([content], { type: "text/markdown;charset=utf-8" }), ensureExtension(filename, ".md"));
}

export function exportHtml(filename: string, html: string, title: string) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${exportCss()}</style></head><body><article class="markdown-body">${html}</article></body></html>`;
  saveAs(new Blob([doc], { type: "text/html;charset=utf-8" }), ensureExtension(filename, ".html"));
}

export async function exportPng(filename: string, element: HTMLElement) {
  const canvas = await html2canvas(element, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2, useCORS: true });
  canvas.toBlob((blob) => {
    if (blob) saveAs(blob, ensureExtension(filename, ".png"));
  }, "image/png");
}

export async function exportPdf(filename: string, element: HTMLElement, options: PdfExportOptions = {}) {
  document.documentElement.dataset.pdfRendering = "true";
  const runtimeStyle = installPdfRuntimeStyle();
  let exportElement: HTMLElement | null = null;
  try {
    reportPdfProgress(options, "preparing", 0.08);
    await nextAnimationFrame();
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
    pdf.save(ensureExtension(filename, ".pdf"));
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

export async function copyImage(element: HTMLElement, filename = "preview.png"): Promise<CopyImageResult> {
  const canvas = await html2canvas(element, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2, useCORS: true });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return "unavailable";
  if (await copyPngBlobToClipboard(blob)) return "copied";
  downloadBlob(blob, ensureExtension(filename, ".png"));
  return "downloaded";
}

function ensureExtension(filename: string, extension: string) {
  return filename.toLowerCase().endsWith(extension) ? filename : `${filename}${extension}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function exportCss() {
  return `body{margin:0;background:#fff;color:#24292f;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.markdown-body{box-sizing:border-box;max-width:920px;margin:0 auto;padding:48px}pre{background:#f6f8fa;padding:16px;border-radius:6px;overflow:auto}.diagram-viewer,.stl-container,.map-summary{border:1px solid #d0d7de;border-radius:8px;padding:12px;margin:16px 0}`;
}
