import type { RefObject } from "react";
import { Copy, Download, FileCode2, FileDown, FileImage, GitBranch, Languages, MessageCircle, Plus, Save, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGE_LABELS } from "../lib/i18n";
import { PROFESSIONAL_PROFILES } from "../lib/professionalProfiles";
import type { GlobalState } from "../types";

interface WorkspaceToolbarProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  globalState: GlobalState;
  onGlobalChange: (patch: Partial<GlobalState>) => void;
  onNewTab: () => void;
  onGithubImport: () => void;
  onFilesSelected: (files: FileList) => void;
  onExportMarkdown: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
  onCopyMarkdown: () => void;
  onCopyWechat: () => void;
  onCopyPreviewImage: () => void;
  onShare: () => void;
}

export function WorkspaceToolbar({
  fileInputRef,
  globalState,
  onGlobalChange,
  onNewTab,
  onGithubImport,
  onFilesSelected,
  onExportMarkdown,
  onExportHtml,
  onExportPdf,
  onExportPng,
  onCopyMarkdown,
  onCopyWechat,
  onCopyPreviewImage,
  onShare,
}: WorkspaceToolbarProps) {
  const { t } = useTranslation();
  const labels = {
    copy: t("action.copy"),
    copyPng: t("action.copyPng"),
    copyWechat: t("action.copyWechat"),
    github: "GitHub",
    html: "HTML",
    import: t("action.import"),
    direction: globalState.direction.toUpperCase(),
    md: "MD",
    new: t("action.new"),
    offlineFirst: t("setting.offlineFirst"),
    pdf: "PDF",
    png: "PNG",
    share: t("action.share"),
    sync: t("setting.sync"),
  };

  return (
    <div className="workspace-toolbar">
      <div className="toolbar-group">
        <button className="workspace-action" title={labels.new} aria-label={labels.new} onClick={onNewTab}><Plus size={15} /><span className="toolbar-button-label">{labels.new}</span></button>
        <button className="workspace-action" title={labels.import} aria-label={labels.import} onClick={() => fileInputRef.current?.click()}><Download size={15} /><span className="toolbar-button-label">{labels.import}</span></button>
        <button className="workspace-action" title={labels.github} aria-label={labels.github} onClick={onGithubImport}><GitBranch size={15} /><span className="toolbar-button-label">{labels.github}</span></button>
        <input
          ref={fileInputRef}
          hidden
          type="file"
          multiple
          accept=".md,.markdown,.txt"
          onChange={(event) => event.target.files && onFilesSelected(event.target.files)}
        />
      </div>
      <div className="toolbar-group">
        <button className="workspace-action" title={labels.md} aria-label={labels.md} onClick={onExportMarkdown}><Save size={15} /><span className="toolbar-button-label">{labels.md}</span></button>
        <button className="workspace-action" title={labels.html} aria-label={labels.html} onClick={onExportHtml}><FileCode2 size={15} /><span className="toolbar-button-label">{labels.html}</span></button>
        <button className="workspace-action" title={labels.pdf} aria-label={labels.pdf} onClick={onExportPdf}><FileDown size={15} /><span className="toolbar-button-label">{labels.pdf}</span></button>
        <button className="workspace-action" title={labels.png} aria-label={labels.png} onClick={onExportPng}><FileImage size={15} /><span className="toolbar-button-label">{labels.png}</span></button>
        <button className="workspace-action" title={labels.copy} aria-label={labels.copy} onClick={onCopyMarkdown}><Copy size={15} /><span className="toolbar-button-label">{labels.copy}</span></button>
        <button className="workspace-action" title={labels.copyWechat} aria-label={labels.copyWechat} onClick={onCopyWechat}><MessageCircle size={15} /><span className="toolbar-button-label">{labels.copyWechat}</span></button>
        <button className="workspace-action" title={labels.copyPng} aria-label={labels.copyPng} onClick={onCopyPreviewImage}><FileImage size={15} /><span className="toolbar-button-label">{labels.copyPng}</span></button>
        <button className="workspace-action" title={labels.share} aria-label={labels.share} onClick={onShare}><Share2 size={15} /><span className="toolbar-button-label">{labels.share}</span></button>
      </div>
      <div className="toolbar-group compact">
        <label title={labels.sync}>
          <input
            aria-label={labels.sync}
            type="checkbox"
            checked={globalState.syncScroll}
            onChange={(event) => onGlobalChange({ syncScroll: event.target.checked })}
          />
          <span className="toolbar-setting-label">{labels.sync}</span>
        </label>
        <label title={labels.offlineFirst}>
          <input
            aria-label={labels.offlineFirst}
            type="checkbox"
            checked={globalState.offlineFirst}
            onChange={(event) => onGlobalChange({ offlineFirst: event.target.checked })}
          />
          <span className="toolbar-setting-label">{labels.offlineFirst}</span>
        </label>
        <select
          className="profile-select"
          value={globalState.professionalProfile}
          onChange={(event) => onGlobalChange({ professionalProfile: event.target.value as GlobalState["professionalProfile"] })}
          title={t("setting.professionalProfile")}
        >
          {Object.values(PROFESSIONAL_PROFILES).map((profile) => <option key={profile.id} value={profile.id}>{profile.shortLabel}</option>)}
        </select>
        <select
          value={globalState.language}
          onChange={(event) => onGlobalChange({ language: event.target.value })}
          title={t("setting.language")}
        >
          {Object.entries(LANGUAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button className="workspace-action direction-action" title={labels.direction} aria-label={labels.direction} onClick={() => onGlobalChange({ direction: globalState.direction === "rtl" ? "ltr" : "rtl" })}>
          <Languages size={15} /><span className="toolbar-button-label">{labels.direction}</span>
        </button>
      </div>
    </div>
  );
}
