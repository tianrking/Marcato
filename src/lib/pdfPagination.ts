export interface PdfPageConfig {
  contentWidth: number;
  contentHeight: number;
  margin: number;
}

export interface PdfLayoutOptions {
  signal?: AbortSignal;
}

interface FlowElement {
  element: HTMLElement;
  type: "text" | "heading" | "graphic" | "table" | "pre" | "blockquote" | "list";
  top: number;
  height: number;
  bottom: number;
}

const PAGE_BREAK_SPACER_CLASS = "pdf-page-break-spacer";
const TABLE_SPACER_CLASS = "pdf-table-page-break-spacer";
const PDF_TARGET_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "blockquote",
  "pre",
  "table",
  "img",
  "svg",
  "canvas",
  ".math-block",
  ".diagram-viewer",
  "hr",
].join(",");

export const A4_PDF_CONFIG: PdfPageConfig = {
  contentWidth: 180,
  contentHeight: 267,
  margin: 15,
};

export function createPdfExportClone(source: HTMLElement, config = A4_PDF_CONFIG) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.className = `${source.className} pdf-export`;
  clone.removeAttribute("id");
  clone.style.width = `${config.contentWidth}mm`;
  clone.style.maxWidth = "none";
  clone.style.padding = "0";
  clone.style.margin = "0";
  clone.style.position = "fixed";
  clone.style.left = "-10000px";
  clone.style.top = "0";
  clone.style.background = "#ffffff";
  clone.style.color = "#24292f";
  clone.style.zIndex = "-1";
  clone.style.pointerEvents = "none";

  clone.querySelectorAll(".diagram-toolbar,.diagram-status,.mini-button,.leaflet-control").forEach((node) => node.remove());
  copyCanvasPixels(source, clone);
  normalizeExportDom(clone);
  document.body.appendChild(clone);
  return clone;
}

export async function preparePdfLayout(source: HTMLElement, config = A4_PDF_CONFIG, options: PdfLayoutOptions = {}) {
  throwIfAborted(options.signal);
  const clone = createPdfExportClone(source, config);
  try {
    await waitForExportAssets(clone, options.signal);
    throwIfAborted(options.signal);
    await nextFrame();
    throwIfAborted(options.signal);
    applyPageBreakCascade(clone, config, 10);
    throwIfAborted(options.signal);
    await nextFrame();
    throwIfAborted(options.signal);
    return clone;
  } catch (error) {
    clone.remove();
    throw error;
  }
}

export function getPageHeightPx(container: HTMLElement, config = A4_PDF_CONFIG) {
  return container.getBoundingClientRect().width * (config.contentHeight / config.contentWidth);
}

export function estimatePdfPageCount(container: HTMLElement, config = A4_PDF_CONFIG) {
  const pageHeightPx = getPageHeightPx(container, config);
  return Math.max(1, Math.ceil(container.getBoundingClientRect().height / pageHeightPx));
}

function applyPageBreakCascade(container: HTMLElement, config: PdfPageConfig, maxIterations: number) {
  let previousSignature = "";

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    resetPagination(container);
    const pageHeightPx = getPageHeightPx(container, config);
    fitWideBlocks(container);
    splitOversizedTables(container, pageHeightPx);

    const elements = collectFlowElements(container);
    const totalHeight = Math.ceil(container.getBoundingClientRect().height);
    const boundaries = makeBoundaries(totalHeight, pageHeightPx);
    let applied = 0;

    for (const item of elements) {
      const boundary = boundaries.find((value) => item.top < value && item.bottom > value - 1);
      if (!boundary) {
        if (item.type !== "text" && item.type !== "heading" && item.height > pageHeightPx) {
          scaleElementToPage(item.element, Math.max(0.5, (pageHeightPx - 24) / item.height));
          applied += 1;
        }
        continue;
      }

      const remaining = boundary - item.top;
      if (item.type === "heading") {
        insertSpacerBefore(item.element, Math.max(0, remaining + 4));
        applied += 1;
        continue;
      }

      if (item.type === "text" && item.height > 0) {
        const shift = calculateTextShift(item, boundary);
        if (shift > 0.5) {
          insertSpacerBefore(item.element, shift);
          applied += 1;
        }
        continue;
      }

      const scaleNeeded = (remaining - 18) / item.height;
      if (item.type === "graphic" && remaining / pageHeightPx > 0.22 && scaleNeeded >= 0.6) {
        scaleElementToPage(item.element, Math.min(1, scaleNeeded));
      } else {
        insertSpacerBefore(item.element, Math.max(0, remaining + 18));
      }
      applied += 1;
    }

    const signature = `${applied}:${Math.round(container.getBoundingClientRect().height)}`;
    if (signature === previousSignature || applied === 0) break;
    previousSignature = signature;
  }
}

function collectFlowElements(container: HTMLElement): FlowElement[] {
  const containerRect = container.getBoundingClientRect();
  const elements: FlowElement[] = [];
  container.querySelectorAll<HTMLElement>(PDF_TARGET_SELECTOR).forEach((element) => {
    if (element.closest(`.${PAGE_BREAK_SPACER_CLASS},.${TABLE_SPACER_CLASS}`)) return;
    if (element.parentElement?.closest("blockquote") && element.tagName.toLowerCase() !== "blockquote") return;
    if (element.parentElement?.closest("li") && element.tagName.toLowerCase() !== "li") return;

    const rect = element.getBoundingClientRect();
    if (rect.height < 1) return;
    const tag = element.tagName.toLowerCase();
    const top = rect.top - containerRect.top;
    const height = rect.height;
    elements.push({
      element,
      type: classifyElement(element, tag),
      top,
      height,
      bottom: top + height,
    });
  });
  return elements;
}

function classifyElement(element: HTMLElement, tag: string): FlowElement["type"] {
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "table") return "table";
  if (tag === "pre") return "pre";
  if (tag === "blockquote") return "blockquote";
  if (tag === "li") return "list";
  if (tag === "p") return "text";
  if (tag === "hr") return "graphic";
  if (element.classList.contains("math-block") || element.classList.contains("diagram-viewer")) return "graphic";
  return "graphic";
}

function makeBoundaries(totalHeight: number, pageHeightPx: number) {
  const boundaries: number[] = [];
  for (let boundary = pageHeightPx; boundary < totalHeight; boundary += pageHeightPx) {
    boundaries.push(boundary);
  }
  return boundaries;
}

function calculateTextShift(item: FlowElement, boundary: number) {
  const style = window.getComputedStyle(item.element);
  const fontSize = parseFloat(style.fontSize) || 14;
  let lineHeight = parseFloat(style.lineHeight);
  if (Number.isNaN(lineHeight)) lineHeight = fontSize * 1.5;
  if (lineHeight < 10) lineHeight *= fontSize;

  const contentTop = item.top + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0);
  const contentBottom = item.bottom - (parseFloat(style.paddingBottom) || 0) - (parseFloat(style.borderBottomWidth) || 0);
  const lineCount = Math.max(1, Math.round((contentBottom - contentTop) / lineHeight));

  for (let index = 0; index < lineCount; index += 1) {
    const lineTop = contentTop + index * lineHeight;
    const lineBottom = lineTop + lineHeight;
    if (lineTop < boundary - 0.5 && lineBottom > boundary + 0.5) {
      return boundary - lineTop + 4;
    }
  }

  if (item.height <= lineHeight * 3) return boundary - item.top + 4;
  return 0;
}

function insertSpacerBefore(element: HTMLElement, height: number) {
  if (height <= 0 || !element.parentElement) return;
  const spacer = document.createElement("div");
  spacer.className = PAGE_BREAK_SPACER_CLASS;
  spacer.style.height = `${height}px`;
  spacer.style.margin = "0";
  spacer.style.padding = "0";
  spacer.style.border = "0";
  element.parentElement.insertBefore(spacer, element);
}

function splitOversizedTables(container: HTMLElement, pageHeightPx: number) {
  container.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    if (table.dataset.pdfSplitPart === "true") return;
    const rect = table.getBoundingClientRect();
    if (rect.height <= pageHeightPx) return;
    const tbody = table.tBodies[0] || table.querySelector("tbody");
    if (!tbody) return;

    const rows = Array.from(tbody.children).filter((row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement);
    if (rows.length < 2) return;

    const containerRect = container.getBoundingClientRect();
    const header = table.querySelector("thead");
    let currentTable = table;
    let currentBody = tbody;
    let activePage = 0;

    const rowPositions = rows.map((row) => {
      const rowRect = row.getBoundingClientRect();
      return {
        row,
        top: rowRect.top - containerRect.top,
        height: rowRect.height,
      };
    });

    rowPositions.forEach(({ row, top, height }) => {
      const rowPage = Math.floor(top / pageHeightPx);
      if (rowPage > activePage && height < pageHeightPx * 0.9) {
        const nextTable = table.cloneNode(false) as HTMLTableElement;
        nextTable.dataset.pdfSplitPart = "true";
        if (header) nextTable.appendChild(header.cloneNode(true));
        const nextBody = document.createElement("tbody");
        nextTable.appendChild(nextBody);

        const spacer = document.createElement("div");
        spacer.className = TABLE_SPACER_CLASS;
        spacer.style.height = `${Math.max(0, rowPage * pageHeightPx - top)}px`;
        spacer.style.margin = "0";
        spacer.style.padding = "0";
        spacer.style.border = "0";

        currentTable.after(spacer);
        spacer.after(nextTable);
        currentTable = nextTable;
        currentBody = nextBody;
        activePage = rowPage;
      }
      if (currentTable !== table) currentBody.appendChild(row);
    });
  });
}

function scaleElementToPage(element: HTMLElement, scale: number) {
  if (scale >= 0.999) return;
  const rect = element.getBoundingClientRect();
  element.style.transform = `scale(${scale})`;
  element.style.transformOrigin = "top left";
  element.style.width = `${rect.width / scale}px`;
  element.style.height = `${rect.height * scale}px`;
  element.style.overflow = "hidden";
  element.dataset.pdfScale = scale.toFixed(3);
}

function resetPagination(container: HTMLElement) {
  container.querySelectorAll(`.${PAGE_BREAK_SPACER_CLASS},.${TABLE_SPACER_CLASS}`).forEach((node) => node.remove());
  container.querySelectorAll<HTMLElement>("[data-pdf-scale]").forEach((node) => {
    node.style.transform = "";
    node.style.transformOrigin = "";
    node.style.height = "";
    node.style.width = "";
    node.style.overflow = "";
    node.style.maxWidth = "";
    delete node.dataset.pdfScale;
  });
}

function fitWideBlocks(container: HTMLElement) {
  const availableWidth = container.getBoundingClientRect().width;
  container.querySelectorAll<HTMLElement>("img, svg, canvas, pre, table, .diagram-viewer, .leaflet-map-canvas").forEach((element) => {
    if (element.closest("table") && element.tagName.toLowerCase() !== "table") return;
    const rect = element.getBoundingClientRect();
    const naturalWidth = element instanceof HTMLImageElement ? element.naturalWidth : 0;
    const contentWidth = Math.max(rect.width, element.scrollWidth, naturalWidth);
    if (contentWidth <= availableWidth + 1 || rect.height < 1) return;
    const scale = Math.min(1, availableWidth / contentWidth);
    element.style.width = `${Math.ceil(contentWidth)}px`;
    element.style.maxWidth = "none";
    element.style.transform = `scale(${scale})`;
    element.style.transformOrigin = "top left";
    element.style.height = `${rect.height * scale}px`;
    element.style.overflow = "hidden";
    element.dataset.pdfScale = scale.toFixed(3);
  });
}

function normalizeExportDom(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>(".diagram-viewer").forEach((viewer) => {
    viewer.classList.remove("is-loading");
    viewer.style.breakInside = "avoid";
  });
  container.querySelectorAll<HTMLElement>("table, pre, blockquote, .math-block, .diagram-viewer").forEach((element) => {
    element.style.breakInside = "avoid";
  });
}

function copyCanvasPixels(source: HTMLElement, clone: HTMLElement) {
  const sourceCanvases = source.querySelectorAll("canvas");
  const cloneCanvases = clone.querySelectorAll("canvas");
  sourceCanvases.forEach((sourceCanvas, index) => {
    const cloneCanvas = cloneCanvases[index];
    if (!cloneCanvas) return;
    cloneCanvas.width = sourceCanvas.width;
    cloneCanvas.height = sourceCanvas.height;
    cloneCanvas.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
  });
}

async function waitForExportAssets(container: HTMLElement, signal?: AbortSignal) {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(images.map((image) => {
    throwIfAborted(signal);
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const cleanup = () => {
        image.removeEventListener("load", onDone);
        image.removeEventListener("error", onDone);
        signal?.removeEventListener("abort", onDone);
      };
      const onDone = () => {
        cleanup();
        resolve();
      };
      image.addEventListener("load", onDone, { once: true });
      image.addEventListener("error", onDone, { once: true });
      signal?.addEventListener("abort", onDone, { once: true });
    });
  }));
  throwIfAborted(signal);
  await (document.fonts?.ready || Promise.resolve());
  throwIfAborted(signal);
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("PDF export cancelled", "AbortError");
}
