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
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      renderWithWorker(activeTab.content, requestId, controller.signal)
        .then((result) => {
          if (controller.signal.aborted || requestRef.current !== requestId) return;
          const nextDocument = createPreviewDocument(result);
          setDocument(nextDocument);
          setToc(result.toc);
          setState("idle");
          setError("");
        })
        .catch((renderError) => {
          if (controller.signal.aborted || isAbortError(renderError) || requestRef.current !== requestId) return;
          void renderFallback(activeTab.content)
            .then((fallback) => {
              if (controller.signal.aborted || requestRef.current !== requestId) return;
              const nextDocument = createPreviewDocument(fallback);
              setDocument(nextDocument);
              setToc(fallback.toc);
              setState("idle");
              setError("");
            })
            .catch(() => {
              if (controller.signal.aborted || requestRef.current !== requestId) return;
              setState("error");
              setError(renderError instanceof Error ? renderError.message : "Render failed");
            });
        });
    }, getRenderDelay(activeTab.content));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab]);

  return { document, toc, state, error };
}

async function renderFallback(markdown: string) {
  const { renderMarkdownToHtml } = await import("../lib/markdownCore");
  return renderMarkdownToHtml(markdown, false);
}

function renderWithWorker(markdown: string, requestId: number, signal?: AbortSignal): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const worker = getWorker();
    let settled = false;
    let timeout = 0;
    const settle = (done: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      done();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.id !== requestId) return;
      settle(() => {
        if (event.data.ok) resolve(event.data.result as RenderResult);
        else reject(new Error(event.data.error || "Preview worker failed"));
      });
    };
    const onAbort = () => settle(() => reject(createAbortError()));
    timeout = window.setTimeout(() => {
      settle(() => reject(new Error("Preview worker timed out")));
    }, 6000);
    worker.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ id: requestId, markdown, segmented: true });
  });
}

function createAbortError() {
  return new DOMException("Preview render cancelled", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
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
