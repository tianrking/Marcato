export function exportMarkdown(filename: string, content: string) {
  downloadBlob(new Blob([content], { type: "text/markdown;charset=utf-8" }), ensureExtension(filename, ".md"));
}

export async function exportHtml(filename: string, source: HTMLElement, title: string, expectedRevision?: string) {
  const snapshot = await snapshotPreview(source, expectedRevision);
  const styles = collectDocumentCss();
  const base = typeof document === "undefined" ? "" : `<base href="${escapeHtmlAttribute(document.baseURI)}">`;
  const doc = `<!doctype html><html${documentElementAttributes()}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${base}<title>${escapeHtml(title)}</title><style>${styles}</style></head><body${bodyAttributes()}><article${serializeSafePreviewAttributes(snapshot)}>${snapshot.innerHTML}</article></body></html>`;
  downloadBlob(new Blob([doc], { type: "text/html;charset=utf-8" }), ensureExtension(filename, ".html"));
}

export async function waitForPreviewExportReady(element: HTMLElement, timeoutMs = 15_000, expectedRevision?: string) {
  const startedAt = Date.now();
  while (hasPendingPreviewContent(element) || !matchesPreviewRevision(element, expectedRevision)) {
    if (Date.now() - startedAt >= timeoutMs) {
      const pending = [...element.querySelectorAll(".diagram-viewer.is-loading,.math-inline:not([data-rendered='1']),.math-block:not([data-rendered='1'])")]
        .map((node) => `${node.tagName}.${node.className}`);
      throw new Error(`Preview rendering did not finish before export. ready=${element.dataset.exportReady || "missing"} revision=${element.dataset.previewRevision || "missing"} pending=${pending.join("|")}`);
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
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

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

async function snapshotPreview(source: HTMLElement, expectedRevision?: string) {
  await waitForPreviewExportReady(source, 15_000, expectedRevision);
  assertPreviewRevision(source, expectedRevision);
  const clone = source.cloneNode(true) as HTMLElement;
  assertPreviewRevision(source, expectedRevision);
  snapshotCanvases(source, clone);
  clone.querySelectorAll(".is-selected").forEach((node) => node.classList.remove("is-selected"));
  clone.querySelectorAll(".diagram-toolbar,.diagram-status,.stl-controls,.leaflet-control-container,script").forEach((node) => node.remove());
  clone.querySelectorAll("mark.preview-find-highlight").forEach((mark) => mark.replaceWith(...mark.childNodes));
  clone.querySelectorAll("[contenteditable],[spellcheck]").forEach((node) => {
    node.removeAttribute("contenteditable");
    node.removeAttribute("spellcheck");
  });
  return clone;
}

function serializeSafePreviewAttributes(element: HTMLElement) {
  const classes = [...element.classList].filter((name) => /^[a-z0-9_-]+$/i.test(name));
  const attributes = [`class="${escapeHtmlAttribute(classes.join(" "))}"`];
  for (const name of ["data-profile", "data-wechat-style"] as const) {
    const value = element.getAttribute(name);
    if (value) attributes.push(`${name}="${escapeHtmlAttribute(value)}"`);
  }
  return ` ${attributes.join(" ")}`;
}

function documentElementAttributes() {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  return serializeAttributes([
    ["lang", root.lang],
    ["dir", root.dir || document.body.dir],
    ["data-theme", root.dataset.theme],
    ["data-accent", root.dataset.accent],
    ["data-professional-profile", root.dataset.professionalProfile],
  ]);
}

function bodyAttributes() {
  if (typeof document === "undefined") return "";
  return serializeAttributes([["dir", document.body.dir]]);
}

function serializeAttributes(attributes: Array<[string, string | undefined]>) {
  return attributes
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, value]) => ` ${name}="${escapeHtmlAttribute(value)}"`)
    .join("");
}

function snapshotCanvases(source: HTMLElement, clone: HTMLElement) {
  const sourceCanvases = [...source.querySelectorAll("canvas")];
  const clonedCanvases = [...clone.querySelectorAll("canvas")];
  sourceCanvases.forEach((canvas, index) => {
    const clonedCanvas = clonedCanvases[index];
    if (!clonedCanvas) return;
    try {
      const image = document.createElement("img");
      image.src = canvas.toDataURL("image/png");
      image.alt = canvas.getAttribute("aria-label") || "Rendered diagram";
      image.className = canvas.className;
      image.width = canvas.width;
      image.height = canvas.height;
      image.style.maxWidth = "100%";
      image.style.height = "auto";
      clonedCanvas.replaceWith(image);
    } catch {
      const fallback = document.createElement("p");
      fallback.textContent = "This canvas could not be embedded in the exported HTML.";
      clonedCanvas.replaceWith(fallback);
    }
  });
}

function collectDocumentCss() {
  const rules = [exportCss()];
  for (const sheet of document.styleSheets) {
    try {
      rules.push([...sheet.cssRules].map((rule) => rule.cssText).join("\n"));
    } catch {
      // Cross-origin styles cannot be inspected. The local fallback still keeps the export readable.
    }
  }
  return rules.join("\n");
}

function hasPendingPreviewContent(element: HTMLElement) {
  return element.dataset.exportReady !== "1" || Boolean(element.querySelector(".diagram-viewer.is-loading,.math-inline:not([data-rendered='1']),.math-block:not([data-rendered='1'])"));
}

export function assertPreviewRevision(element: HTMLElement, expectedRevision?: string) {
  if (!matchesPreviewRevision(element, expectedRevision)) {
    throw new Error("Preview changed before it could be exported. Please try again.");
  }
}

function matchesPreviewRevision(element: HTMLElement, expectedRevision?: string) {
  return !expectedRevision || element.dataset.previewRevision === expectedRevision;
}

function exportCss() {
  return `body{margin:0;background:#fff;color:#24292f;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.markdown-body{box-sizing:border-box;max-width:920px;margin:0 auto;padding:48px}pre{background:#f6f8fa;padding:16px;border-radius:6px;overflow:auto}.diagram-viewer,.stl-container,.map-summary{border:1px solid #d0d7de;border-radius:8px;padding:12px;margin:16px 0}`;
}
