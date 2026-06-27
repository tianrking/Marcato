import { Files, Menu, Moon, Palette, PanelLeft, PanelRight, Sparkles, SplitSquareHorizontal, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildInfo } from "../lib/buildInfo";
import type { AccentPalette, ThemeMode, ViewMode } from "../types";
import { IconButton, Segmented } from "./Common";

interface AppHeaderProps {
  stats: {
    minutes: number;
    words: number;
    chars: number;
  };
  accent: AccentPalette;
  easterEggs: boolean;
  theme: ThemeMode;
  viewMode: ViewMode;
  onOpenDocumentLibrary: () => void;
  onAccentChange: (accent: AccentPalette) => void;
  onEasterEggsChange: (enabled: boolean) => void;
  onOpenMobileMenu: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
}

const ACCENT_OPTIONS: Array<{ id: AccentPalette; label: string }> = [
  { id: "blue", label: "Blue" },
  { id: "teal", label: "Teal" },
  { id: "violet", label: "Violet" },
  { id: "rose", label: "Rose" },
  { id: "amber", label: "Amber" },
];

export function AppHeader({ accent, easterEggs, stats, theme, viewMode, onAccentChange, onEasterEggsChange, onOpenDocumentLibrary, onOpenMobileMenu, onThemeChange, onViewModeChange }: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="app-header">
      <div className="brand">
        <img src="/icon.jpg" alt="" />
        <div>
          <h1>{t("app.title")}</h1>
          <p>{stats.minutes} min read | {stats.words} words | {stats.chars} chars</p>
        </div>
      </div>
      <div className="header-actions">
        <button className="icon-button library-trigger" title="Document library" aria-label="Open document library" onClick={onOpenDocumentLibrary}>
          <Files size={17} />
        </button>
        <button className="icon-button mobile-menu-trigger" title="Open mobile menu" aria-label="Open mobile menu" onClick={onOpenMobileMenu}>
          <Menu size={17} />
        </button>
        <Segmented
          value={viewMode}
          options={[
            ["editor", <PanelLeft key="editor" size={16} />, t("view.editor")],
            ["split", <SplitSquareHorizontal key="split" size={16} />, t("view.split")],
            ["preview", <PanelRight key="preview" size={16} />, t("view.preview")],
          ]}
          onChange={(value) => onViewModeChange(value as ViewMode)}
        />
        <div className="accent-picker" aria-label="Accent color">
          <Palette size={15} aria-hidden="true" />
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={accent === option.id ? "active" : ""}
              data-accent-option={option.id}
              title={`${option.label} accent`}
              aria-label={`${option.label} accent`}
              aria-pressed={accent === option.id}
              onClick={() => onAccentChange(option.id)}
            />
          ))}
        </div>
        <IconButton title="Toggle theme" onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
        <button
          type="button"
          className={easterEggs ? "icon-button cyber-toggle active" : "icon-button cyber-toggle"}
          title="Toggle cyber effects"
          aria-label="Toggle cyber effects"
          aria-pressed={easterEggs}
          onClick={() => onEasterEggsChange(!easterEggs)}
        >
          <Sparkles size={17} />
        </button>
        <div
          className="repo-version"
          title={`Marcato ${buildInfo.label}\nBranch: ${buildInfo.ref}\nCommit: ${buildInfo.commit || buildInfo.shortCommit}\nBuilt: ${buildInfo.buildTime}`}
        >
          <a className="repo-link" href="https://github.com/tianrking/Marcato" target="_blank" rel="noreferrer" title="Marcato on GitHub" aria-label="Marcato on GitHub">
            <GitHubMark />
          </a>
          <span className="version-badge" aria-label={`Current version ${buildInfo.label}`}>{buildInfo.label}</span>
        </div>
      </div>
    </header>
  );
}

function GitHubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2 .4-2.5-.5-2.7-1-.1-.3-.6-1-.9-1.2-.3-.2-.8-.7 0-.7.7 0 1.2.7 1.4 1 .8 1.3 2 .9 2.2.7.1-.6.3-.9.5-1.1-1.8-.2-3.7-.9-3.7-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3-1.9 3.7-3.7 3.9.3.3.6.8.6 1.6v2.3c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z"
      />
    </svg>
  );
}
