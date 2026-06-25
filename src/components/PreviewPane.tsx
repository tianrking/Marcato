import { forwardRef, memo } from "react";
import type { PreviewBlock, PreviewDocument } from "../lib/previewDocument";

interface PreviewPaneProps {
  document: PreviewDocument;
}

const PreviewBlockView = memo(function PreviewBlockView({ block }: { block: PreviewBlock }) {
  return (
    <div
      className="preview-block"
      data-preview-block-id={block.id}
      data-block-hash={block.hash}
      data-start-line={block.startLine}
      data-end-line={block.endLine}
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
});

export const PreviewPane = forwardRef<HTMLElement, PreviewPaneProps>(function PreviewPane({ document }, ref) {
  return (
    <article ref={ref} className="markdown-body preview-article">
      {document.mode === "segmented" ? (
        document.blocks.map((block) => <PreviewBlockView key={block.id} block={block} />)
      ) : (
        <div className="preview-full" dangerouslySetInnerHTML={{ __html: document.html }} />
      )}
    </article>
  );
});
