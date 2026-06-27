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

  return (
    <div className="workspace-toolbar">
      <div className="toolbar-group">
        <button onClick={onNewTab}><Plus size={16} />{t("action.new")}</button>
        <button onClick={() => fileInputRef.current?.click()}><Download size={16} />{t("action.import")}</button>
        <button onClick={onGithubImport}><GitBranch size={16} />GitHub</button>
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
        <button onClick={onExportMarkdown}><Save size={16} />MD</button>
        <button onClick={onExportHtml}><FileCode2 size={16} />HTML</button>
        <button onClick={onExportPdf}><FileDown size={16} />PDF</button>
        <button onClick={onExportPng}><FileImage size={16} />PNG</button>
        <button onClick={onCopyMarkdown}><Copy size={16} />{t("action.copy")}</button>
        <button onClick={onCopyWechat}><MessageCircle size={16} />{t("action.copyWechat")}</button>
        <button onClick={onCopyPreviewImage}><FileImage size={16} />{t("action.copyPng")}</button>
        <button onClick={onShare}><Share2 size={16} />{t("action.share")}</button>
      </div>
      <div className="toolbar-group compact">
        <label>
          <input
            type="checkbox"
            checked={globalState.syncScroll}
            onChange={(event) => onGlobalChange({ syncScroll: event.target.checked })}
          />
          {t("setting.sync")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={globalState.offlineFirst}
            onChange={(event) => onGlobalChange({ offlineFirst: event.target.checked })}
          />
          {t("setting.offlineFirst")}
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
        <button onClick={() => onGlobalChange({ direction: globalState.direction === "rtl" ? "ltr" : "rtl" })}>
          <Languages size={16} />{globalState.direction.toUpperCase()}
        </button>
      </div>
    </div>
  );
}
