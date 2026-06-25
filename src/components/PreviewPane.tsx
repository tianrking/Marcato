import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import type { PreviewBlock, PreviewDocument } from "../lib/previewDocument";

interface PreviewPaneProps {
  document: PreviewDocument;
  offlineFirst: boolean;
  selectedBlockId?: string;
  theme: "light" | "dark";
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

export const PreviewPane = forwardRef<HTMLElement, PreviewPaneProps>(function PreviewPane({
  document,
  offlineFirst,
  selectedBlockId,
  theme,
  onBlockSelect,
}, ref) {
  const articleRef = useRef<HTMLElement | null>(null);

  useImperativeHandle(ref, () => articleRef.current as HTMLElement, []);

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return undefined;
    const controller = new AbortController();
    void import("../lib/diagramRenderers").then(({ disposePreviewResources, postProcessPreview }) => {
      if (controller.signal.aborted) return;
      disposePreviewResources(root);
      void postProcessPreview(root, theme, offlineFirst, controller.signal);
    });
    return () => {
      controller.abort();
      void import("../lib/diagramRenderers").then(({ disposePreviewResources }) => disposePreviewResources(root));
    };
  }, [document, theme, offlineFirst]);

  return (
    <article ref={articleRef} className="markdown-body preview-article">
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
