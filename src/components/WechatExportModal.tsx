import { useEffect, useId, useState } from "react";
import { Copy, Download, Image, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Common";
import { WechatStylePicker } from "./WechatStylePicker";
import { downloadBlob } from "../lib/downloads";
import { getExportName } from "../lib/exportNames";
import { wechatStyleClassName } from "../lib/wechatStyles";
import type { WechatStyle } from "../types";
import {
  buildWechatClipboardPayload,
  buildWechatCopyReadyDocument,
  copyWechatRichText,
  extractWechatDraftMetadata,
} from "../lib/wechatExport";

interface WechatExportModalProps {
  fallbackTitle: string;
  onClose: () => void;
  onNotify: (message: string) => void;
  source: HTMLElement;
  style: WechatStyle;
}

export function WechatExportModal({ fallbackTitle, onClose, onNotify, source, style }: WechatExportModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => extractWechatDraftMetadata(source, fallbackTitle));
  const [includeTitle, setIncludeTitle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportStyle, setExportStyle] = useState(style);
  const [status, setStatus] = useState("");
  const [stats] = useState(() => buildWechatClipboardPayload(source, { excludeTitle: true }).stats);
  const titleId = useId();
  const summaryId = useId();
  const directImages = stats.embeddedImages + stats.preservedWechatImages;

  useEffect(() => {
    applySnapshotStyle(source, exportStyle);
  }, [exportStyle, source]);

  const copyField = async (value: string, label: string) => {
    if (!value.trim()) return;
    try {
      await copyPlainText(value);
      setStatus(t("wechat.fieldCopied", { label }));
    } catch {
      setStatus(t("wechat.copyFailed"));
    }
  };

  const copyBody = async () => {
    setBusy(true);
    try {
      const result = await copyWechatRichText(source, { excludeTitle: !includeTitle, style: exportStyle });
      const message = result.method === "plain-text"
        ? t("toast.wechatCopiedPlain")
        : t("toast.wechatCopied", {
            direct: result.stats.embeddedImages + result.stats.preservedWechatImages,
            images: result.stats.imagePlaceholders,
            diagrams: result.stats.diagrams,
          });
      setStatus(message);
      onNotify(message);
    } catch {
      const message = t("toast.wechatCopyFailed");
      setStatus(message);
      onNotify(message);
    } finally {
      setBusy(false);
    }
  };

  const downloadCopyReady = () => {
    const html = buildWechatCopyReadyDocument(source, draft, { excludeTitle: !includeTitle, style: exportStyle });
    const filename = `${getExportName(draft.title || fallbackTitle)}.wechat.html`;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), filename);
    const message = t("wechat.htmlDownloaded");
    setStatus(message);
    onNotify(message);
  };

  return (
    <Modal title={t("wechat.exportTitle")} onClose={onClose}>
      <div className="wechat-export-modal">
        <section className="wechat-export-summary" aria-label={t("wechat.imageSummary")}>
          <div className="wechat-export-summary-icon"><Image size={20} /></div>
          <div>
            <strong>{t("wechat.ready", { direct: directImages })}</strong>
            <span>{t("wechat.manual", { count: stats.imagePlaceholders })}</span>
          </div>
          <div className="wechat-export-badges">
            <span className="ready">{t("wechat.directBadge", { count: directImages })}</span>
            <span>{t("wechat.manualBadge", { count: stats.imagePlaceholders })}</span>
          </div>
        </section>

        <section className="wechat-export-style-section" aria-label={t("wechat.styleLabel")}>
          <div>
            <strong>{t("wechat.styleLabel")}</strong>
            <small>{t("wechat.styleApplyHint")}</small>
          </div>
          <WechatStylePicker value={exportStyle} onChange={setExportStyle} />
        </section>

        <div className="wechat-export-field">
          <label htmlFor={titleId}>{t("wechat.articleTitle")}</label>
          <div className="wechat-export-field-row">
            <input
              id={titleId}
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
            <button type="button" onClick={() => void copyField(draft.title, t("wechat.articleTitle"))} disabled={!draft.title.trim()}>
              <Copy size={15} />{t("wechat.copyTitle")}
            </button>
          </div>
        </div>

        <div className="wechat-export-field">
          <label htmlFor={summaryId}>{t("wechat.articleSummary")}</label>
          <textarea
            id={summaryId}
            rows={3}
            value={draft.summary}
            placeholder={t("wechat.summaryPlaceholder")}
            onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
          />
          <div className="wechat-export-field-foot">
            <small>{t("wechat.summaryHint")}</small>
            <button type="button" onClick={() => void copyField(draft.summary, t("wechat.articleSummary"))} disabled={!draft.summary.trim()}>
              <Copy size={15} />{t("wechat.copySummary")}
            </button>
          </div>
        </div>

        <label className="wechat-export-option">
          <input type="checkbox" checked={includeTitle} onChange={(event) => setIncludeTitle(event.target.checked)} />
          <span>
            <strong>{t("wechat.includeTitle")}</strong>
            <small>{t("wechat.includeTitleHint")}</small>
          </span>
        </label>

        <aside className="wechat-export-note">
          <Info size={17} />
          <span>{t("wechat.imageHint")}</span>
        </aside>

        <div className="wechat-export-actions">
          <button type="button" onClick={downloadCopyReady}>
            <Download size={16} />{t("wechat.downloadHtml")}
          </button>
          <button className="primary" type="button" onClick={() => void copyBody()} disabled={busy}>
            <Copy size={16} />{busy ? t("wechat.copying") : t("wechat.copyBody", { count: directImages })}
          </button>
        </div>
        <p className="wechat-export-status" role="status" aria-live="polite">{status}</p>
      </div>
    </Modal>
  );
}

function applySnapshotStyle(source: HTMLElement, style: WechatStyle) {
  for (const className of [...source.classList]) {
    if (className.startsWith("wechat-style-")) source.classList.remove(className);
  }
  source.classList.add(wechatStyleClassName(style));
  source.dataset.wechatStyle = style;
}

async function copyPlainText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Insecure contexts can expose the API but still reject the write. Fall through.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-100000px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}
