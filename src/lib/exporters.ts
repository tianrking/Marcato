import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

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

export async function exportPdf(filename: string, element: HTMLElement) {
  const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(ensureExtension(filename, ".pdf"));
}

export async function copyImage(element: HTMLElement) {
  const canvas = await html2canvas(element, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2, useCORS: true });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob || !navigator.clipboard || !("write" in navigator.clipboard)) return false;
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  return true;
}

export function getExportName(title: string) {
  return (title || "document").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").toLowerCase();
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
