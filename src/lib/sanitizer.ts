import DOMPurify from "dompurify";

export function sanitizePreviewHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: [
      "target",
      "rel",
      "data-original-code",
      "data-diagram-engine",
      "data-tex",
      "aria-label",
      "aria-hidden",
      "role",
      "download",
    ],
    ADD_TAGS: ["mjx-container"],
  });
}
