import { useEffect, useRef, useState } from "react";
import { createPreviewDocument, EMPTY_PREVIEW_DOCUMENT } from "../lib/previewDocument";
import type { MarkdownTab, RenderResult } from "../types";

export function useMarkdownRender(activeTab: MarkdownTab | undefined) {
  const [document, setDocument] = useState(EMPTY_PREVIEW_DOCUMENT);
  const [toc, setToc] = useState<RenderResult["toc"]>([]);
  const [state, setState] = useState<"idle" | "rendering" | "error">("idle");
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    if (!activeTab) return;
    setState("rendering");
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      renderWithWorker(activeTab.content, requestId)
        .then((result) => {
          if (requestRef.current !== requestId) return;
          const nextDocument = createPreviewDocument(result);
          setDocument(nextDocument);
          setToc(result.toc);
          setState("idle");
          setError("");
        })
        .catch((renderError) => {
          if (requestRef.current !== requestId) return;
          void renderFallback(activeTab.content)
            .then((fallback) => {
              if (requestRef.current !== requestId) return;
              const nextDocument = createPreviewDocument(fallback);
              setDocument(nextDocument);
              setToc(fallback.toc);
              setState("idle");
              setError("");
            })
            .catch(() => {
              if (requestRef.current !== requestId) return;
              setState("error");
              setError(renderError instanceof Error ? renderError.message : "Render failed");
            });
        });
    }, getRenderDelay(activeTab.content));
    return () => window.clearTimeout(timer);
  }, [activeTab]);

  return { document, toc, state, error };
}

async function renderFallback(markdown: string) {
  const { renderMarkdownToHtml } = await import("../lib/markdownCore");
  return renderMarkdownToHtml(markdown, false);
}

function renderWithWorker(markdown: string, requestId: number): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    let settled = false;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.id !== requestId) return;
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      if (event.data.ok) resolve(event.data.result as RenderResult);
      else reject(new Error(event.data.error || "Preview worker failed"));
    };
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.removeEventListener("message", onMessage);
      reject(new Error("Preview worker timed out"));
    }, 6000);
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id: requestId, markdown, segmented: true });
  });
}

let workerSingleton: Worker | null = null;
function getWorker() {
  if (!workerSingleton) {
    workerSingleton = new Worker(new URL("../workers/markdown.worker.ts", import.meta.url), { type: "module" });
  }
  return workerSingleton;
}

function getRenderDelay(text: string) {
  if (text.length > 80_000) return 420;
  if (text.length > 20_000) return 240;
  return 90;
}
