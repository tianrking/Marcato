import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import type { PreviewBlock, PreviewDocument } from "../lib/previewDocument";
import { applyPreviewFindHighlights, clearPreviewFindHighlights, scrollPreviewHighlightIntoView } from "../lib/previewFind";
import { setupPreviewLinks } from "../lib/previewLinks";
import { profileClassName } from "../lib/professionalProfiles";
import { wechatStyleClassName } from "../lib/wechatStyles";
import type { FindOptions, ProfessionalProfile, WechatStyle } from "../types";

interface PreviewPaneProps {
  document: PreviewDocument;
  offlineFirst: boolean;
  professionalProfile: ProfessionalProfile;
  wechatStyle: WechatStyle;
  findActiveIndex: number;
  findEditorMatchCount: number;
  findOpen: boolean;
  findOptions: FindOptions;
  selectedBlockId?: string;
  theme: "light" | "dark";
  revisionToken: string;
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
    >
      <PreviewHtml html={block.html} />
    </div>
  );
});

const PreviewHtml = memo(function PreviewHtml({ html }: { html: string }) {
  return <div className="preview-html" dangerouslySetInnerHTML={{ __html: html }} />;
});

const PreviewFullView = memo(function PreviewFullView({ html }: { html: string }) {
  return <div className="preview-full" dangerouslySetInnerHTML={{ __html: html }} />;
});

export const PreviewPane = forwardRef<HTMLElement, PreviewPaneProps>(function PreviewPane({
  document,
  findActiveIndex,
  findEditorMatchCount,
  findOpen,
  findOptions,
  offlineFirst,
  professionalProfile,
  wechatStyle,
  selectedBlockId,
  theme,
  revisionToken,
  onBlockSelect,
}, ref) {
  const articleRef = useRef<HTMLElement | null>(null);
  const processingRevisionRef = useRef<object | null>(null);

  useImperativeHandle(ref, () => articleRef.current as HTMLElement, []);

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return undefined;
    const processingToken = {};
    processingRevisionRef.current = processingToken;
    root.dataset.previewRevision = revisionToken;
    root.dataset.exportReady = "0";
    const controller = new AbortController();
    let richProcessorLoaded = false;
    const syncFindHighlights = () => {
      const active = findOpen ? applyPreviewFindHighlights(root, findOptions, findActiveIndex, findEditorMatchCount) : null;
      scrollPreviewHighlightIntoView(root.parentElement, active);
    };
    setupPreviewLinks(root);
    if (!needsRichPreviewProcessing(root)) {
      syncFindHighlights();
      root.dataset.exportReady = "1";
      return () => {
        controller.abort();
        delete root.dataset.exportReady;
      };
    }
    void import("../lib/diagramRenderers")
      .then(({ disposePreviewResources, postProcessPreview }) => {
        if (controller.signal.aborted) return;
        if (processingRevisionRef.current !== processingToken) return;
        richProcessorLoaded = true;
        disposePreviewResources(root);
        return postProcessPreview(root, theme, offlineFirst, controller.signal);
      })
      .catch(() => undefined)
      .finally(() => {
        if (controller.signal.aborted || processingRevisionRef.current !== processingToken) return;
        syncFindHighlights();
        root.dataset.exportReady = "1";
      });
    return () => {
      controller.abort();
      delete root.dataset.exportReady;
      if (richProcessorLoaded) {
        void import("../lib/diagramRenderers").then(({ disposePreviewResources }) => disposePreviewResources(root));
      }
    };
  }, [document, theme, offlineFirst, revisionToken]);

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const active = findOpen ? applyPreviewFindHighlights(root, findOptions, findActiveIndex, findEditorMatchCount) : null;
    if (!findOpen) clearPreviewFindHighlights(root);
    scrollPreviewHighlightIntoView(root.parentElement, active);
  }, [findActiveIndex, findEditorMatchCount, findOpen, findOptions, document]);

  return (
    <article
      ref={articleRef}
      className={`markdown-body preview-article ${profileClassName(professionalProfile)}${professionalProfile === "wechat" ? ` ${wechatStyleClassName(wechatStyle)}` : ""}`}
      data-profile={professionalProfile}
      data-wechat-style={professionalProfile === "wechat" ? wechatStyle : undefined}
    >
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
        <PreviewFullView html={document.html} />
      )}
    </article>
  );
});

function needsRichPreviewProcessing(root: HTMLElement) {
  if (root.querySelector(".math-inline,.math-block,.diagram-viewer")) return true;
  return /:([a-z0-9_+-]+):/i.test(root.textContent || "");
}
