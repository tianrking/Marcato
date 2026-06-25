export function exportMarkdown(filename: string, content: string) {
  downloadBlob(new Blob([content], { type: "text/markdown;charset=utf-8" }), ensureExtension(filename, ".md"));
}

export function exportHtml(filename: string, html: string, title: string) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${exportCss()}</style></head><body><article class="markdown-body">${html}</article></body></html>`;
  downloadBlob(new Blob([doc], { type: "text/html;charset=utf-8" }), ensureExtension(filename, ".html"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ensureExtension(filename: string, extension: string) {
  return filename.toLowerCase().endsWith(extension) ? filename : `${filename}${extension}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function exportCss() {
  return `body{margin:0;background:#fff;color:#24292f;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.markdown-body{box-sizing:border-box;max-width:920px;margin:0 auto;padding:48px}pre{background:#f6f8fa;padding:16px;border-radius:6px;overflow:auto}.diagram-viewer,.stl-container,.map-summary{border:1px solid #d0d7de;border-radius:8px;padding:12px;margin:16px 0}`;
}
