import { forwardRef, memo } from "react";
import type { PreviewBlock, PreviewDocument } from "../lib/previewDocument";

interface PreviewPaneProps {
  document: PreviewDocument;
  selectedBlockId?: string;
  onBlockSelect?: (block: PreviewBlock) => void;
}

const PreviewBlockView = memo(function PreviewBlockView({
  block,
  selected,
  onSelect,
}: {
  block: PreviewBlock;
  selected: boolean;
  onSelect?: (block: PreviewBlock) => void;
}) {
  return (
    <div
      className={selected ? "preview-block is-selected" : "preview-block"}
      data-preview-block-id={block.id}
      data-block-hash={block.hash}
      data-start-line={block.startLine}
      data-end-line={block.endLine}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a,button,input,textarea,select")) return;
        onSelect?.(block);
      }}
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
});

export const PreviewPane = forwardRef<HTMLElement, PreviewPaneProps>(function PreviewPane({ document, selectedBlockId, onBlockSelect }, ref) {
  return (
    <article ref={ref} className="markdown-body preview-article">
      {document.mode === "segmented" ? (
        document.blocks.map((block) => (
          <PreviewBlockView
            key={block.id}
            block={block}
            selected={block.id === selectedBlockId}
            onSelect={onBlockSelect}
          />
        ))
      ) : (
        <div className="preview-full" dangerouslySetInnerHTML={{ __html: document.html }} />
      )}
    </article>
  );
});
