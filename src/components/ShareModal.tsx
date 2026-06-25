import { useTranslation } from "react-i18next";
import { Modal } from "./Common";

interface ShareModalProps {
  mode: "view" | "edit";
  onClose: () => void;
  onCopy: () => void;
  onModeChange: (mode: "view" | "edit") => void;
  tooLong: boolean;
  url: string;
}

export function ShareModal({ mode, onClose, onCopy, onModeChange, tooLong, url }: ShareModalProps) {
  const { t } = useTranslation();
  if (!url) return null;

  return (
    <Modal title="Share URL" onClose={onClose}>
      <textarea className="share-url" readOnly value={url} />
      {tooLong && <p className="share-warning">{t("toast.shareTooLong")}</p>}
      <div className="modal-actions">
        <button className={mode === "view" ? "active" : ""} onClick={() => onModeChange("view")}>{t("status.viewOnlyShare")}</button>
        <button className={mode === "edit" ? "active" : ""} onClick={() => onModeChange("edit")}>{t("status.editableShare")}</button>
        <button disabled={tooLong} onClick={() => void onCopy()}>{t("action.copy")}</button>
      </div>
    </Modal>
  );
}
