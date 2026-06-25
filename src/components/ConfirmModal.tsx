import { AlertTriangle } from "lucide-react";
import { Modal } from "./Common";

interface ConfirmModalProps {
  confirmLabel: string;
  danger?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}

export function ConfirmModal({ confirmLabel, danger = false, message, onCancel, onConfirm, title }: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-modal">
        <div className={danger ? "confirm-icon danger" : "confirm-icon"}>
          <AlertTriangle size={20} />
        </div>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className={danger ? "danger-button" : ""} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
