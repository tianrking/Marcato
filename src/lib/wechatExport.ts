const WECHAT_OFFICIAL_LINK_PATTERN = /^https?:\/\/mp\.weixin\.qq\.com/i;
const INLINE_STYLE_PROPERTIES = [
  "background-color",
  "border",
  "border-bottom",
  "border-left",
  "border-radius",
  "box-sizing",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-height",
  "overflow",
  "overflow-x",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "vertical-align",
  "white-space",
  "width",
  "-webkit-overflow-scrolling",
];

export async function copyWechatRichText(element: HTMLElement) {
  const clone = cloneWithInlineStyles(element);
  normalizeWechatDom(clone);
  const html = wrapWechatClipboardHtml(clone.innerHTML);
  const plainText = clone.textContent || "";

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(plainText);
}

export function buildWechatClipboardHtml(element: HTMLElement) {
  const clone = cloneWithInlineStyles(element);
  normalizeWechatDom(clone);
  return wrapWechatClipboardHtml(clone.innerHTML);
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
      if (value && value !== "normal" && value !== "none" && value !== "auto" && value !== "0px") {
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

function normalizeWechatDom(root: HTMLElement) {
  root.querySelectorAll(".diagram-toolbar, .diagram-status, figcaption").forEach((node) => node.remove());
  root.querySelectorAll("li > ul, li > ol").forEach((nestedList) => {
    nestedList.parentElement?.insertAdjacentElement("afterend", nestedList);
  });
  root.querySelectorAll("a[href^='#']").forEach((link) => link.removeAttribute("href"));
  normalizeImages(root);
  convertExternalLinksToCitations(root);
  sanitizeSvgForWechat(root);
  const before = createEmptyNode();
  const after = createEmptyNode();
  root.insertBefore(before, root.firstChild);
  root.appendChild(after);
}

function normalizeImages(root: HTMLElement) {
  root.querySelectorAll("img").forEach((image) => {
    const width = image.getAttribute("width");
    const height = image.getAttribute("height");
    if (width) {
      image.removeAttribute("width");
      image.style.width = /^\d+$/.test(width) ? `${width}px` : width;
      image.style.maxWidth = "100%";
    }
    if (height) {
      image.removeAttribute("height");
      image.style.height = /^\d+$/.test(height) ? `${height}px` : height;
    }
  });
}

function convertExternalLinksToCitations(root: HTMLElement) {
  const refs: Array<{ title: string; href: string }> = [];
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href) || WECHAT_OFFICIAL_LINK_PATTERN.test(href)) return;
    const text = (anchor.textContent || "").trim();
    if (text === href) {
      anchor.replaceWith(document.createTextNode(text));
      return;
    }
    let index = refs.findIndex((ref) => ref.href === href);
    if (index < 0) {
      refs.push({ title: anchor.getAttribute("title") || text || href, href });
      index = refs.length - 1;
    }
    const sup = document.createElement("sup");
    sup.textContent = `[${index + 1}]`;
    sup.style.fontSize = "90%";
    sup.style.opacity = "0.65";
    anchor.appendChild(sup);
  });

  if (!refs.length) return;
  const heading = document.createElement("h4");
  heading.textContent = "引用链接";
  heading.style.margin = "24px 0 8px";
  heading.style.fontSize = "16px";
  heading.style.fontWeight = "700";
  const paragraph = document.createElement("p");
  paragraph.style.wordBreak = "break-all";
  paragraph.style.fontSize = "14px";
  paragraph.style.lineHeight = "1.7";
  refs.forEach((ref, index) => {
    const code = document.createElement("code");
    code.textContent = `[${index + 1}]`;
    code.style.fontSize = "90%";
    code.style.opacity = "0.6";
    paragraph.appendChild(code);
    paragraph.appendChild(document.createTextNode(ref.href === ref.title ? `: ${ref.href}` : ` ${ref.title}: ${ref.href}`));
    paragraph.appendChild(document.createElement("br"));
  });
  root.appendChild(heading);
  root.appendChild(paragraph);
}

function sanitizeSvgForWechat(root: HTMLElement) {
  root.querySelectorAll("svg").forEach((svg) => {
    svg.querySelectorAll("style, script, foreignObject").forEach((node) => node.remove());
    svg.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      });
      if (node.localName === "text" && node.getAttribute("dominant-baseline")) {
        node.removeAttribute("dominant-baseline");
        node.setAttribute("dy", "0.35em");
      }
    });
    svg.querySelectorAll("tspan").forEach((tspan) => {
      tspan.setAttribute("style", `${tspan.getAttribute("style") || ""};fill:#333333!important;color:#333333!important;stroke:none!important;`);
    });
    if (!svg.getAttribute("width")) svg.setAttribute("width", "100%");
    if (!svg.getAttribute("height") && svg.getAttribute("viewBox")) {
      const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [];
      if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
        svg.setAttribute("height", String(Math.round((Math.min(viewBox[2], 677) * viewBox[3]) / viewBox[2])));
      }
    }
    svg.setAttribute("style", `${svg.getAttribute("style") || ""};max-width:677px;width:100%;height:auto;`);
  });
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
