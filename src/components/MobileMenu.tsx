import {
  Copy,
  Download,
  Eye,
  FileCode2,
  FileDown,
  FileImage,
  GitBranch,
  Languages,
  PanelLeft,
  PanelRight,
  Plus,
  Save,
  Share2,
  SplitSquareHorizontal,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGE_LABELS } from "../lib/i18n";
import type { DocumentHealthReport } from "../lib/documentHealth";
import type { GlobalState, MarkdownTab, ViewMode } from "../types";

interface MobileMenuProps {
  activeTabId: string;
  globalState: GlobalState;
  health: DocumentHealthReport;
  opened: boolean;
  stats: {
    minutes: number;
    words: number;
    chars: number;
  };
  tabs: MarkdownTab[];
  onClose: () => void;
  onCloseTab: (id: string) => void;
  onCopyMarkdown: () => void;
  onCopyPreviewImage: () => void;
  onDuplicateTab: (id: string) => void;
  onExportHtml: () => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
  onGithubImport: () => void;
  onHealthDetails: () => void;
  onImportFiles: () => void;
  onNewTab: () => void;
  onSelectTab: (id: string) => void;
  onShare: () => void;
  onGlobalChange: (patch: Partial<GlobalState>) => void;
}

const VIEW_OPTIONS: Array<{ icon: ReactNode; id: ViewMode; labelKey: string }> = [
  { id: "editor", icon: <PanelLeft size={16} />, labelKey: "view.editor" },
  { id: "split", icon: <SplitSquareHorizontal size={16} />, labelKey: "view.split" },
  { id: "preview", icon: <PanelRight size={16} />, labelKey: "view.preview" },
];

export function MobileMenu({
  activeTabId,
  globalState,
  health,
  opened,
  stats,
  tabs,
  onClose,
  onCloseTab,
  onCopyMarkdown,
  onCopyPreviewImage,
  onDuplicateTab,
  onExportHtml,
  onExportMarkdown,
  onExportPdf,
  onExportPng,
  onGithubImport,
  onHealthDetails,
  onImportFiles,
  onNewTab,
  onSelectTab,
  onShare,
  onGlobalChange,
}: MobileMenuProps) {
  const { t } = useTranslation();
  if (!opened) return null;

  const runAndClose = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="mobile-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile workspace menu">
        <div className="mobile-drawer-head">
          <div>
            <strong>Marcato</strong>
            <span>{stats.minutes} min | {stats.words} words | {stats.chars} chars</span>
          </div>
          <button type="button" aria-label="Close mobile menu" onClick={onClose}><X size={17} /></button>
        </div>

        <section className="mobile-drawer-section">
          <span className="mobile-section-title">{t("view.preview")}</span>
          <div className="mobile-view-grid">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={globalState.viewMode === option.id ? "active" : ""}
                onClick={() => onGlobalChange({ viewMode: option.id })}
              >
                {option.icon}
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </section>

        <section className="mobile-drawer-section">
          <span className="mobile-section-title">{t("health.title")}</span>
          <div className={`mobile-health ${health.score >= 86 ? "strong" : health.score >= 68 ? "good" : "weak"}`}>
            <strong>{health.score}</strong>
            <span>{health.score >= 86 ? t("health.strong") : health.score >= 68 ? t("health.good") : t("health.weak")}</span>
          </div>
          <div className="mobile-health-signals">
            <span>{t("health.headings", { count: health.signals.headings })}</span>
            <span>{t("health.links", { count: health.signals.links })}</span>
            <span>{t("health.images", { count: health.signals.images })}</span>
            <span>{t("health.code", { count: health.signals.codeBlocks })}</span>
          </div>
          <button type="button" className="mobile-wide-action" onClick={() => runAndClose(onHealthDetails)}>
            <Eye size={16} />Details
          </button>
        </section>

        <section className="mobile-drawer-section">
          <span className="mobile-section-title">{t("status.document")}</span>
          <div className="mobile-tab-list">
            {tabs.map((tab) => (
              <div key={tab.id} className={tab.id === activeTabId ? "mobile-tab-row active" : "mobile-tab-row"}>
                <button type="button" className="mobile-tab-name" onClick={() => runAndClose(() => onSelectTab(tab.id))}>
                  <span>{tab.title}</span>
                  <small>{tab.content.length.toLocaleString()}</small>
                </button>
                <button type="button" aria-label={`Duplicate ${tab.title}`} onClick={() => onDuplicateTab(tab.id)}>+</button>
                <button type="button" aria-label={`Close ${tab.title}`} onClick={() => onCloseTab(tab.id)}>x</button>
              </div>
            ))}
          </div>
          <button type="button" className="mobile-wide-action" onClick={() => runAndClose(onNewTab)}>
            <Plus size={16} />{t("action.new")}
          </button>
        </section>

        <section className="mobile-drawer-section">
          <span className="mobile-section-title">{t("action.import")} / {t("action.export")}</span>
          <div className="mobile-action-grid">
            <button type="button" onClick={() => runAndClose(onImportFiles)}><Download size={16} />{t("action.import")}</button>
            <button type="button" onClick={() => runAndClose(onGithubImport)}><GitBranch size={16} />GitHub</button>
            <button type="button" onClick={() => runAndClose(onExportMarkdown)}><Save size={16} />MD</button>
            <button type="button" onClick={() => runAndClose(onExportHtml)}><FileCode2 size={16} />HTML</button>
            <button type="button" onClick={() => runAndClose(onExportPdf)}><FileDown size={16} />PDF</button>
            <button type="button" onClick={() => runAndClose(onExportPng)}><FileImage size={16} />PNG</button>
            <button type="button" onClick={() => runAndClose(onCopyMarkdown)}><Copy size={16} />{t("action.copy")}</button>
            <button type="button" onClick={() => runAndClose(onCopyPreviewImage)}><FileImage size={16} />{t("action.copyPng")}</button>
            <button type="button" onClick={() => runAndClose(onShare)}><Share2 size={16} />{t("action.share")}</button>
          </div>
        </section>

        <section className="mobile-drawer-section">
          <span className="mobile-section-title">{t("setting.language")}</span>
          <label className="mobile-toggle">
            <input
              type="checkbox"
              checked={globalState.syncScroll}
              onChange={(event) => onGlobalChange({ syncScroll: event.target.checked })}
            />
            {t("setting.sync")}
          </label>
          <label className="mobile-toggle">
            <input
              type="checkbox"
              checked={globalState.offlineFirst}
              onChange={(event) => onGlobalChange({ offlineFirst: event.target.checked })}
            />
            {t("setting.offlineFirst")}
          </label>
          <div className="mobile-settings-row">
            <select value={globalState.language} onChange={(event) => onGlobalChange({ language: event.target.value })}>
              {Object.entries(LANGUAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <button type="button" onClick={() => onGlobalChange({ direction: globalState.direction === "rtl" ? "ltr" : "rtl" })}>
              <Languages size={16} />{globalState.direction.toUpperCase()}
            </button>
          </div>
        </section>

        <div className="mobile-drawer-foot">
          <Eye size={14} />
          <span>{t("status.document")} stays local unless you import, export, or share.</span>
        </div>
      </aside>
    </div>
  );
}
