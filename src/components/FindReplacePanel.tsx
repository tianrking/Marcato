import { FileSearch, Replace } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FindMatch, FindOptions, FindScope } from "../types";

interface FindReplacePanelProps {
  activeMatch: number;
  docked: boolean;
  matches: FindMatch[];
  options: FindOptions;
  onClose: () => void;
  onDockedChange: (docked: boolean) => void;
  onOptionsChange: (options: FindOptions) => void;
  onReplaceAll: () => void;
  onReplaceCurrent: () => void;
  onStep: (direction: 1 | -1) => void;
}

const FIND_SCOPES: Array<{ value: FindScope; label: string }> = [
  { value: "document", label: "Document" },
  { value: "selection", label: "Selection" },
  { value: "heading", label: "Current heading" },
  { value: "code", label: "Code blocks" },
  { value: "prose", label: "Prose only" },
];

export function FindReplacePanel({
  activeMatch,
  docked,
  matches,
  options,
  onClose,
  onDockedChange,
  onOptionsChange,
  onReplaceAll,
  onReplaceCurrent,
  onStep,
}: FindReplacePanelProps) {
  const { t } = useTranslation();
  const update = (patch: Partial<FindOptions>) => onOptionsChange({ ...options, ...patch });

  return (
    <div className={docked ? "find-panel docked" : "find-panel"}>
      <div className="modal-head">
        <strong><FileSearch size={16} /> {t("find.title")}</strong>
        <button onClick={onClose}>x</button>
      </div>
      <input value={options.query} placeholder={t("find.find")} onChange={(event) => update({ query: event.target.value })} />
      <input value={options.replacement} placeholder={t("find.replacement")} onChange={(event) => update({ replacement: event.target.value })} />
      <label className="find-scope">
        <span>{t("find.scope", { defaultValue: "Scope" })}</span>
        <select
          value={options.inSelection ? "selection" : options.scope}
          onChange={(event) => update({ scope: event.target.value as FindScope, inSelection: event.target.value === "selection" })}
        >
          {FIND_SCOPES.map((scope) => (
            <option key={scope.value} value={scope.value}>
              {t(`find.scope_${scope.value}`, { defaultValue: scope.label })}
            </option>
          ))}
        </select>
      </label>
      <div className="check-grid">
        <label><input type="checkbox" checked={options.caseSensitive} onChange={(event) => update({ caseSensitive: event.target.checked })} />{t("find.case")}</label>
        <label><input type="checkbox" checked={options.wholeWord} onChange={(event) => update({ wholeWord: event.target.checked })} />{t("find.word")}</label>
        <label><input type="checkbox" checked={options.regex} onChange={(event) => update({ regex: event.target.checked })} />{t("find.regex")}</label>
        <label><input type="checkbox" checked={options.preserveCase} onChange={(event) => update({ preserveCase: event.target.checked })} />{t("find.preserveCase")}</label>
        <label><input type="checkbox" checked={docked} onChange={(event) => onDockedChange(event.target.checked)} />{t("find.dock")}</label>
      </div>
      <div className="modal-actions">
        <button onClick={() => onStep(-1)}>{t("find.prev")}</button>
        <button onClick={() => onStep(1)}>{t("find.next")}</button>
        <button onClick={onReplaceCurrent}><Replace size={15} />{t("find.current")}</button>
        <button onClick={onReplaceAll}><Replace size={15} />{t("find.all")}</button>
      </div>
      <small>{matches.length ? `${activeMatch + 1} / ${matches.length}` : t("find.noMatches")}</small>
    </div>
  );
}
