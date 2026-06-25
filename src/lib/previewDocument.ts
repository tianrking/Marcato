import type { RenderBlock, RenderResult, TocEntry } from "../types";
import { sanitizePreviewHtml } from "./sanitizer";

export type PreviewDocument =
  | {
      mode: "full";
      html: string;
      toc: TocEntry[];
    }
  | {
      mode: "segmented";
      blocks: PreviewBlock[];
      toc: TocEntry[];
    };

export interface PreviewBlock extends RenderBlock {
  html: string;
}

export const EMPTY_PREVIEW_DOCUMENT: PreviewDocument = {
  mode: "full",
  html: "",
  toc: [],
};

export function createPreviewDocument(result: RenderResult): PreviewDocument {
  if (result.mode === "segmented" && result.blocks?.length) {
    return {
      mode: "segmented",
      blocks: result.blocks.map((block) => ({
        ...block,
        html: sanitizePreviewHtml(block.html),
      })),
      toc: result.toc,
    };
  }

  return {
    mode: "full",
    html: sanitizePreviewHtml(result.html || ""),
    toc: result.toc,
  };
}

export function previewDocumentToHtml(document: PreviewDocument) {
  if (document.mode === "full") return document.html;
  return document.blocks
    .map(
      (block) =>
        `<div class="preview-block" data-preview-block-id="${block.id}" data-block-hash="${block.hash}" data-start-line="${block.startLine}" data-end-line="${block.endLine}">${block.html}</div>`,
    )
    .join("\n");
}
