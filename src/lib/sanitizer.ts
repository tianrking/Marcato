import DOMPurify from "dompurify";

export function sanitizePreviewHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: [
      "target",
      "rel",
      "nodeleaf",
      "data-role",
      "data-pluginname",
      "data-id",
      "data-nickname",
      "data-headimg",
      "data-signature",
      "data-service_type",
      "data-verify_status",
      "data-original-code",
      "data-diagram-engine",
      "data-tex",
      "aria-label",
      "aria-hidden",
      "role",
      "download",
      "xmlns",
    ],
    ADD_TAGS: ["mjx-container", "mp-common-profile"],
  });
}

export function sanitizeRemoteDiagramSvg(svg: string) {
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "iframe", "script"],
    FORBID_ATTR: ["onabort", "onblur", "onerror", "onfocus", "onload", "onclick", "onmouseover"],
  });
  const parsed = new DOMParser().parseFromString(sanitized, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== "svg" || root.querySelector("parsererror")) {
    throw new Error("Remote renderer did not return a valid SVG.");
  }
  root.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name) || /^javascript:/i.test(attribute.value.trim())) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return new XMLSerializer().serializeToString(root);
}
