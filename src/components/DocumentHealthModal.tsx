import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Common";
import type { DocumentHealthReport } from "../lib/documentHealth";

interface DocumentHealthModalProps {
  health: DocumentHealthReport;
  onClose: () => void;
  onJumpToLine: (line: number) => void;
}

export function DocumentHealthModal({ health, onClose, onJumpToLine }: DocumentHealthModalProps) {
  const { t } = useTranslation();
  const tone = health.score >= 86 ? "strong" : health.score >= 68 ? "good" : "weak";

  return (
    <Modal title="Document health" onClose={onClose}>
      <div className="health-detail-modal">
        <div className={`health-detail-score ${tone}`}>
          <ShieldCheck size={22} />
          <strong>{health.score}</strong>
          <span>{health.score >= 86 ? t("health.strong") : health.score >= 68 ? t("health.good") : t("health.weak")}</span>
        </div>
        <div className="health-detail-signals" aria-label="Document signals">
          <span>{t("health.headings", { count: health.signals.headings })}</span>
          <span>{t("health.links", { count: health.signals.links })}</span>
          <span>{t("health.images", { count: health.signals.images })}</span>
          <span>{t("health.code", { count: health.signals.codeBlocks })}</span>
        </div>
        <div className="health-detail-issues">
          {health.issues.length ? health.issues.map((issue, index) => (
            <button
              key={`${issue.code}-${issue.line || index}-${JSON.stringify(issue.params || {})}`}
              type="button"
              className={`health-detail-issue ${issue.level}`}
              onClick={() => issue.line && onJumpToLine(issue.line)}
              disabled={!issue.line}
            >
              <span>{issue.level}</span>
              <strong>{t(`health.issue.${issue.code}`, issue.params)}</strong>
              {issue.line && <small>Line {issue.line}</small>}
            </button>
          )) : (
            <p className="modal-empty">{t("health.empty")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
