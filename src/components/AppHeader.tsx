import { Moon, PanelLeft, PanelRight, SplitSquareHorizontal, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ThemeMode, ViewMode } from "../types";
import { IconButton, Segmented } from "./Common";

interface AppHeaderProps {
  stats: {
    minutes: number;
    words: number;
    chars: number;
  };
  theme: ThemeMode;
  viewMode: ViewMode;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
}

export function AppHeader({ stats, theme, viewMode, onThemeChange, onViewModeChange }: AppHeaderProps) {
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
        <Segmented
          value={viewMode}
          options={[
            ["editor", <PanelLeft key="editor" size={16} />, t("view.editor")],
            ["split", <SplitSquareHorizontal key="split" size={16} />, t("view.split")],
            ["preview", <PanelRight key="preview" size={16} />, t("view.preview")],
          ]}
          onChange={(value) => onViewModeChange(value as ViewMode)}
        />
        <IconButton title="Toggle theme" onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
      </div>
    </header>
  );
}
