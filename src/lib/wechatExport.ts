const WECHAT_OFFICIAL_LINK_PATTERN = /^https?:\/\/mp\.weixin\.qq\.com(?:\/|$)/i;
const WECHAT_IMAGE_HOST_PATTERN = /^https?:\/\/(?:[^/]+\.)?(?:mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn)(?:\/|$)/i;

const INLINE_STYLE_PROPERTIES = [
  "background",
  "background-color",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "box-sizing",
  "clear",
  "color",
  "display",
  "float",
  "font-family",
  "font-size",
  "font-style",
  "font-variant-numeric",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "table-layout",
  "text-align",
  "text-decoration",
  "text-indent",
  "text-overflow",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
  "word-wrap",
  "-webkit-overflow-scrolling",
];

export interface WechatExportStats {
  diagrams: number;
  imagePlaceholders: number;
  links: number;
  math: number;
  mediaPlaceholders: number;
  preservedWechatImages: number;
}

export interface WechatClipboardPayload {
  html: string;
  plainText: string;
  stats: WechatExportStats;
}

export interface WechatCopyResult {
  method: "clipboard-api" | "selection" | "plain-text";
  stats: WechatExportStats;
}

interface PreparedWechatClipboard extends WechatClipboardPayload {
  fragmentHtml: string;
}

export async function copyWechatRichText(element: HTMLElement): Promise<WechatCopyResult> {
  const payload = prepareWechatClipboard(element);

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([payload.html], { type: "text/html" }),
          "text/plain": new Blob([payload.plainText], { type: "text/plain" }),
        }),
      ]);
      return { method: "clipboard-api", stats: payload.stats };
    } catch {
      // Some browsers expose ClipboardItem but reject rich HTML. Keep a rich-text fallback.
    }
  }

  if (copyHtmlWithSelection(payload.fragmentHtml)) {
    return { method: "selection", stats: payload.stats };
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.plainText);
    return { method: "plain-text", stats: payload.stats };
  }

  throw new Error("This browser could not write the WeChat article to the clipboard.");
}

export function buildWechatClipboardPayload(element: HTMLElement): WechatClipboardPayload {
  const payload = prepareWechatClipboard(element);
  return {
    html: payload.html,
    plainText: payload.plainText,
    stats: payload.stats,
  };
}

export function buildWechatClipboardHtml(element: HTMLElement) {
  return prepareWechatClipboard(element).html;
}

function prepareWechatClipboard(element: HTMLElement): PreparedWechatClipboard {
  const clone = cloneWithInlineStyles(element);
  const stats = normalizeWechatDom(clone);
  const fragmentHtml = clone.innerHTML;
  return {
    fragmentHtml,
    html: wrapWechatClipboardHtml(fragmentHtml),
    plainText: serializeWechatPlainText(clone),
    stats,
  };
}

function cloneWithInlineStyles(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  inlineComputedStyles(source, clone);
  return clone;
}

function inlineComputedStyles(source: Element, clone: Element) {
  if (source instanceof HTMLElement && clone instanceof HTMLElement) {
    const computed = window.getComputedStyle(source);
    for (const property of INLINE_STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value && value !== "normal" && value !== "none" && value !== "auto") {
        clone.style.setProperty(property, value);
      }
    }
    clone.removeAttribute("contenteditable");
    clone.removeAttribute("spellcheck");
  }

  if (source instanceof SVGElement && clone instanceof SVGElement) {
    const computed = window.getComputedStyle(source);
    for (const property of ["color", "fill", "font-family", "font-size", "stroke", "stroke-width"]) {
      const value = computed.getPropertyValue(property);
      if (value && value !== "none") clone.style.setProperty(property, value);
    }
  }

  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    const sourceChild = sourceChildren[index];
    const cloneChild = cloneChildren[index];
    if (sourceChild && cloneChild) inlineComputedStyles(sourceChild, cloneChild);
  }
}

function normalizeWechatDom(root: HTMLElement): WechatExportStats {
  const stats: WechatExportStats = {
    diagrams: 0,
    imagePlaceholders: 0,
    links: 0,
    math: 0,
    mediaPlaceholders: 0,
    preservedWechatImages: 0,
  };

  replaceDiagramsWithSource(root, stats);
  replaceMathWithSource(root, stats);
  replaceImagesWithAnnotations(root, stats);
  replaceUnsupportedMedia(root, stats);
  normalizeTaskCheckboxes(root);
  convertLinksToVisibleTargets(root, stats);
  normalizeNestedLists(root);
  normalizeCodeBlocks(root);
  removePreviewChrome(root);
  stripPreviewOnlyAttributes(root);

  const before = createEmptyNode();
  const after = createEmptyNode();
  root.insertBefore(before, root.firstChild);
  root.appendChild(after);
  return stats;
}

function replaceDiagramsWithSource(root: HTMLElement, stats: WechatExportStats) {
  root.querySelectorAll<HTMLElement>(".diagram-viewer").forEach((viewer) => {
    const surface = viewer.querySelector<HTMLElement>(".diagram-surface");
    const engine = String(viewer.dataset.diagramEngine || surface?.classList[1] || "diagram").toLowerCase();
    const label = (viewer.querySelector("figcaption")?.textContent || diagramLabel(engine)).trim();
    const source = safeDecodeURIComponent(surface?.dataset.originalCode || "") || surface?.textContent || "";
    const language = engine === "graphviz" ? "dot" : engine;
    const fallback = createSourceFallback({
      heading: `【图表：${label}；请在此处手动插入导出的 PNG】`,
      instruction: `公众号粘贴不可靠地保留交互图表或 SVG；下方保留原始 ${label} 源码，便于复制、修改或重新生成。`,
      language,
      source,
    });
    viewer.replaceWith(fallback);
    stats.diagrams += 1;
  });
}

function replaceMathWithSource(root: HTMLElement, stats: WechatExportStats) {
  root.querySelectorAll<HTMLElement>(".math-inline,.math-block").forEach((node) => {
    const tex = node.dataset.tex || node.textContent?.replace(/^\$\$?|\$\$?$/g, "") || "";
    if (node.classList.contains("math-inline")) {
      const replacement = document.createElement("span");
      replacement.textContent = `$${tex}$`;
      replacement.style.fontFamily = "ui-monospace, SFMono-Regular, Consolas, monospace";
      replacement.style.wordBreak = "break-word";
      node.replaceWith(replacement);
    } else {
      node.replaceWith(createSourceFallback({
        heading: "【公式：请在此处手动插入公式图片】",
        instruction: "公众号粘贴不可靠地保留 KaTeX 排版；下方保留原始 LaTeX。",
        language: "latex",
        source: tex,
      }));
    }
    stats.math += 1;
  });
}

function replaceImagesWithAnnotations(root: HTMLElement, stats: WechatExportStats) {
  const targets = Array.from(root.querySelectorAll<HTMLElement>(".wechat-slider, img"))
    .filter((target) => target.matches(".wechat-slider") || !target.closest(".wechat-slider"));

  targets.forEach((target) => {
    if (!root.contains(target)) return;
    if (target.matches(".wechat-slider")) {
      const fragment = document.createDocumentFragment();
      target.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
        const caption = image.parentElement?.querySelector("p")?.textContent?.trim() || "";
        const linkedTarget = visibleImageLinkTarget(image);
        if (isWechatHostedImage(image.getAttribute("src") || "")) {
          normalizeWechatHostedImage(image);
          fragment.appendChild(image);
          if (caption) fragment.appendChild(createImageCaption(caption));
          if (linkedTarget) fragment.appendChild(createFallbackParagraph(`图片链接：${linkedTarget}`, true));
          stats.preservedWechatImages += 1;
          if (linkedTarget) stats.links += 1;
          return;
        }
        fragment.appendChild(createImageAnnotation(image, caption, stats.imagePlaceholders + 1, linkedTarget));
        stats.imagePlaceholders += 1;
        if (linkedTarget) stats.links += 1;
      });
      target.replaceWith(fragment);
      return;
    }

    const image = target as HTMLImageElement;
    if (image.closest(".mp_profile_iframe_wrp")) return;
    const src = image.getAttribute("src") || "";
    if (isWechatHostedImage(src)) {
      normalizeWechatHostedImage(image);
      stats.preservedWechatImages += 1;
      return;
    }

    const figure = image.closest("figure");
    const caption = figure?.querySelector("figcaption")?.textContent?.trim() || "";
    const replacementTarget = resolveImageReplacementTarget(image);
    const anchor = image.closest<HTMLAnchorElement>("a[href]");
    const linkedTarget = anchor && (replacementTarget === anchor || replacementTarget.contains(anchor))
      ? visibleImageLinkTarget(image)
      : "";
    const annotation = createImageAnnotation(image, caption, stats.imagePlaceholders + 1, linkedTarget);
    replacementTarget.replaceWith(annotation);
    stats.imagePlaceholders += 1;
    if (linkedTarget) stats.links += 1;
  });
}

function createImageAnnotation(image: HTMLImageElement, caption: string, index: number, linkedTarget = "") {
  const src = (image.getAttribute("src") || "").trim();
  const alt = (image.getAttribute("alt") || image.getAttribute("title") || caption || imageNameFromSource(src) || `图片 ${index}`).trim();
  const section = createFallbackSection();
  const heading = createFallbackHeading(`【图片 ${index}：${alt}】`);
  const instruction = createFallbackParagraph("请在公众号编辑器中在此处手动插入原图。");
  section.append(heading);
  if (caption && caption !== alt) section.append(createFallbackParagraph(`图片说明：${caption}`));

  if (/^https?:\/\//i.test(src)) {
    section.append(createFallbackParagraph(`原图：${src}`, true));
  } else if (/^data:/i.test(src)) {
    section.append(createFallbackParagraph("原图：内嵌图片（请从 Marcato 资源库或原稿重新上传；未复制 Base64 数据）。"));
  } else if (/^blob:/i.test(src)) {
    section.append(createFallbackParagraph("原图：浏览器临时图片（blob URL 离开当前页面后失效，请从原稿重新上传）。"));
  } else if (/^file:/i.test(src)) {
    section.append(createFallbackParagraph("原图：本地文件（请从原路径手动上传）。"));
  } else if (src) {
    section.append(createFallbackParagraph(`原图位置：${src}（相对路径不能直接发布，请从原稿位置手动上传）。`, true));
  } else {
    section.append(instruction);
  }

  if (linkedTarget) section.append(createFallbackParagraph(`图片链接：${linkedTarget}`, true));
  if (src) section.append(instruction);
  return section;
}

function createImageCaption(caption: string) {
  const paragraph = document.createElement("p");
  paragraph.textContent = caption;
  paragraph.style.margin = "6px 0 16px";
  paragraph.style.color = "#666666";
  paragraph.style.fontSize = "14px";
  paragraph.style.lineHeight = "1.7";
  paragraph.style.textAlign = "center";
  return paragraph;
}

function resolveImageReplacementTarget(image: HTMLImageElement): Element {
  const figure = image.closest("figure");
  if (figure && !figure.classList.contains("diagram-viewer") && figure.querySelectorAll("img").length === 1) return figure;
  const picture = image.closest("picture");
  if (picture && picture.querySelectorAll("img").length === 1) return picture;
  const anchor = image.closest("a");
  if (anchor && anchor.querySelectorAll("img").length === 1 && !(anchor.textContent || "").trim()) return anchor;
  return image;
}

function visibleImageLinkTarget(image: HTMLImageElement) {
  const href = (image.closest<HTMLAnchorElement>("a[href]")?.getAttribute("href") || "").trim();
  if (!href || href.startsWith("#") || /^(?:javascript|data|blob|file):/i.test(href)) return "";
  return visibleLinkTarget(href);
}

function replaceUnsupportedMedia(root: HTMLElement, stats: WechatExportStats) {
  root.querySelectorAll<HTMLElement>("svg,canvas,video,audio,iframe,object,embed").forEach((node) => {
    if (!root.contains(node) || node.closest(".mp_profile_iframe_wrp")) return;
    const label = node.getAttribute("aria-label") || node.getAttribute("title") || mediaLabel(node.tagName.toLowerCase());
    const source = node.getAttribute("src") || node.querySelector("source")?.getAttribute("src") || "";
    const section = createFallbackSection();
    section.append(createFallbackHeading(`【${label}：请在此处手动插入兼容的图片或媒体】`));
    if (source && !/^(?:data|blob):/i.test(source)) section.append(createFallbackParagraph(`来源：${source}`, true));
    node.replaceWith(section);
    stats.mediaPlaceholders += 1;
  });
}

function normalizeTaskCheckboxes(root: HTMLElement) {
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
    input.replaceWith(document.createTextNode(input.checked ? "☑ " : "☐ "));
  });
}

function convertLinksToVisibleTargets(root: HTMLElement, stats: WechatExportStats) {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = (anchor.getAttribute("href") || "").trim();
    const text = (anchor.textContent || "").trim();

    if (!href || href.startsWith("#") || /^(?:javascript|data|blob|file):/i.test(href)) {
      unwrapElement(anchor);
      return;
    }

    const target = visibleLinkTarget(href);
    const alreadyVisible = text === target || text.includes(target);
    if (WECHAT_OFFICIAL_LINK_PATTERN.test(href)) {
      if (!alreadyVisible) anchor.insertAdjacentText("afterend", ` ${target}`);
      stats.links += 1;
      return;
    }

    const replacement = document.createElement("span");
    replacement.style.overflowWrap = "anywhere";
    replacement.style.wordBreak = "break-word";
    while (anchor.firstChild) replacement.appendChild(anchor.firstChild);
    if (!text) replacement.appendChild(document.createTextNode(target));
    else if (!alreadyVisible) replacement.appendChild(document.createTextNode(` ${target}`));
    anchor.replaceWith(replacement);
    stats.links += 1;
  });
}

function normalizeNestedLists(root: HTMLElement) {
  root.querySelectorAll("li > ul, li > ol").forEach((nestedList) => {
    nestedList.parentElement?.insertAdjacentElement("afterend", nestedList);
  });
}

function normalizeCodeBlocks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("pre").forEach((pre) => {
    pre.style.maxWidth = "100%";
    pre.style.overflowWrap = "anywhere";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.querySelectorAll<HTMLElement>("code").forEach((code) => {
      code.style.display = "block";
      code.style.whiteSpace = "pre-wrap";
    });
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode as Text;
      text.nodeValue = (text.nodeValue || "").replace(/\t/g, "    ");
    }
  });
}

function removePreviewChrome(root: HTMLElement) {
  root.querySelectorAll(".diagram-toolbar,.diagram-status,.mini-button,.leaflet-control,.stl-controls,button,select,textarea").forEach((node) => node.remove());
  root.querySelectorAll<HTMLElement>(".preview-find-highlight,.preview-block,.preview-full").forEach((node) => unwrapElement(node));
}

function stripPreviewOnlyAttributes(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    if (element.matches(".mp_profile_iframe_wrp,.mp_profile_iframe_wrp *")) return;
    for (const attribute of Array.from(element.attributes)) {
      if (
        /^(?:on|aria-|data-)/i.test(attribute.name)
        || ["class", "contenteditable", "draggable", "id", "rel", "role", "spellcheck", "tabindex", "target"].includes(attribute.name)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    for (const property of Array.from(element.style)) {
      if (/url\s*\(/i.test(element.style.getPropertyValue(property))) element.style.removeProperty(property);
    }
  });
}

function createSourceFallback({ heading, instruction, language, source }: { heading: string; instruction: string; language: string; source: string }) {
  const section = createFallbackSection();
  section.append(createFallbackHeading(heading));
  section.append(createFallbackParagraph(instruction));
  if (source.trim()) {
    const pre = document.createElement("pre");
    pre.style.boxSizing = "border-box";
    pre.style.margin = "10px 0 0";
    pre.style.maxWidth = "100%";
    pre.style.overflowWrap = "anywhere";
    pre.style.padding = "12px";
    pre.style.backgroundColor = "#f6f8fa";
    pre.style.border = "1px solid #d8dee4";
    pre.style.borderRadius = "6px";
    pre.style.color = "#24292f";
    pre.style.fontFamily = "ui-monospace, SFMono-Regular, Consolas, monospace";
    pre.style.fontSize = "13px";
    pre.style.lineHeight = "1.6";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    const code = document.createElement("code");
    code.textContent = `\`\`\`${language}\n${source.trimEnd()}\n\`\`\``;
    code.style.display = "block";
    code.style.whiteSpace = "pre-wrap";
    pre.appendChild(code);
    section.appendChild(pre);
  }
  return section;
}

function createFallbackSection() {
  const section = document.createElement("section");
  section.style.boxSizing = "border-box";
  section.style.margin = "16px 0";
  section.style.padding = "12px 14px";
  section.style.backgroundColor = "#f8fafc";
  section.style.border = "1px dashed #94a3b8";
  section.style.borderRadius = "6px";
  section.style.color = "#334155";
  section.style.fontFamily = "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif";
  return section;
}

function createFallbackHeading(text: string) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = text;
  paragraph.appendChild(strong);
  paragraph.style.margin = "0";
  paragraph.style.color = "#1e293b";
  paragraph.style.fontSize = "15px";
  paragraph.style.fontWeight = "700";
  paragraph.style.lineHeight = "1.7";
  return paragraph;
}

function createFallbackParagraph(text: string, breakAnywhere = false) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  paragraph.style.margin = "6px 0 0";
  paragraph.style.color = "#475569";
  paragraph.style.fontSize = "14px";
  paragraph.style.lineHeight = "1.7";
  if (breakAnywhere) {
    paragraph.style.overflowWrap = "anywhere";
    paragraph.style.wordBreak = "break-all";
  }
  return paragraph;
}

function normalizeWechatHostedImage(image: HTMLImageElement) {
  const width = image.getAttribute("width");
  const height = image.getAttribute("height");
  image.removeAttribute("width");
  image.removeAttribute("height");
  image.style.display = "block";
  image.style.margin = "12px auto";
  image.style.maxWidth = "100%";
  image.style.width = width && /^\d+$/.test(width) ? `${width}px` : width || "auto";
  image.style.height = height && /^\d+$/.test(height) ? `${height}px` : height || "auto";
}

function isWechatHostedImage(src: string) {
  return WECHAT_IMAGE_HOST_PATTERN.test(src.trim());
}

function visibleLinkTarget(href: string) {
  if (/^mailto:/i.test(href)) return href.replace(/^mailto:/i, "");
  if (/^tel:/i.test(href)) return href.replace(/^tel:/i, "");
  return href;
}

function imageNameFromSource(source: string) {
  if (!source || /^(?:data|blob):/i.test(source)) return "";
  try {
    const pathname = /^https?:\/\//i.test(source) ? new URL(source).pathname : source;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "").replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return "";
  }
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function diagramLabel(engine: string) {
  const labels: Record<string, string> = {
    abc: "ABC notation",
    d2: "D2",
    geojson: "GeoJSON map",
    graphviz: "Graphviz",
    markmap: "Markmap",
    mermaid: "Mermaid",
    plantuml: "PlantUML",
    stl: "STL model",
    topojson: "TopoJSON map",
    vegalite: "Vega-Lite",
    "vega-lite": "Vega-Lite",
    wavedrom: "WaveDrom",
  };
  return labels[engine] || engine || "图表";
}

function mediaLabel(tagName: string) {
  const labels: Record<string, string> = {
    audio: "音频",
    canvas: "画布图形",
    embed: "嵌入内容",
    iframe: "嵌入内容",
    object: "嵌入对象",
    svg: "矢量图",
    video: "视频",
  };
  return labels[tagName] || "媒体";
}

function unwrapElement(element: Element) {
  element.replaceWith(...Array.from(element.childNodes));
}

function serializeWechatPlainText(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    if (image.closest(".mp_profile_iframe_wrp")) return;
    const src = (image.getAttribute("src") || "").trim();
    const alt = (image.getAttribute("alt") || image.getAttribute("title") || imageNameFromSource(src) || "已托管图片").trim();
    const lines = [`【微信图片：${alt}】`];
    if (src) lines.push(`图片地址：${src}`);
    image.replaceWith(document.createTextNode(`\n${lines.join("\n")}\n`));
  });
  clone.querySelectorAll("br").forEach((node) => node.replaceWith(document.createTextNode("\n")));
  clone.querySelectorAll("hr").forEach((node) => node.replaceWith(document.createTextNode("\n——\n")));
  clone.querySelectorAll("li").forEach((item) => {
    const parent = item.parentElement;
    const prefix = parent?.tagName === "OL"
      ? `${Array.from(parent.children).indexOf(item) + 1}. `
      : "• ";
    item.insertBefore(document.createTextNode(prefix), item.firstChild);
  });
  clone.querySelectorAll("td,th").forEach((cell) => cell.insertAdjacentText("afterend", "\t"));
  clone.querySelectorAll("address,article,aside,blockquote,dd,div,dl,dt,figcaption,figure,footer,h1,h2,h3,h4,h5,h6,header,li,main,nav,ol,p,pre,section,table,tr,ul").forEach((block) => {
    block.insertAdjacentText("beforebegin", "\n");
    block.insertAdjacentText("afterend", "\n");
  });
  return (clone.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function copyHtmlWithSelection(fragmentHtml: string) {
  if (typeof document.execCommand !== "function") return false;
  const container = document.createElement("div");
  container.setAttribute("contenteditable", "true");
  container.setAttribute("aria-hidden", "true");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = "677px";
  container.innerHTML = fragmentHtml;
  document.body.appendChild(container);

  const selection = window.getSelection();
  const previousRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    selection?.removeAllRanges();
    previousRanges.forEach((range) => selection?.addRange(range));
    activeElement?.focus();
    container.remove();
  }
}

function createEmptyNode() {
  const node = document.createElement("p");
  node.style.fontSize = "0";
  node.style.lineHeight = "0";
  node.style.margin = "0";
  node.innerHTML = "&nbsp;";
  return node;
}

function wrapWechatClipboardHtml(body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}
