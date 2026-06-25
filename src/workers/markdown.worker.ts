import { renderMarkdownToHtml } from "../lib/markdownCore";

self.onmessage = (event: MessageEvent) => {
  const { id, markdown, segmented } = event.data || {};
  try {
    const result = renderMarkdownToHtml(String(markdown || ""), segmented !== false);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Markdown render failed",
    });
  }
};

export {};
