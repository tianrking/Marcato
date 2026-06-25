import { Replace } from "lucide-react";
import { Modal } from "./Common";

interface ReplacePreviewItem {
  after: string;
  before: string;
  index: number;
  replacement: string;
  text: string;
}

interface ReplacePreviewModalProps {
  count: number;
  items: ReplacePreviewItem[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReplacePreviewModal({ count, items, onCancel, onConfirm }: ReplacePreviewModalProps) {
  return (
    <Modal title="Replace all preview" onClose={onCancel}>
      <div className="replace-preview-modal">
        <p>
          <Replace size={16} />
          <span>{count.toLocaleString()} matches will be replaced. Previewing the first {items.length.toLocaleString()}.</span>
        </p>
        <div className="replace-preview-list">
          {items.map((item) => (
            <pre key={item.index}>
              <span>{item.before}</span>
              <del>{item.text}</del>
              <ins>{item.replacement}</ins>
              <span>{item.after}</span>
            </pre>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm}>Replace all</button>
        </div>
      </div>
    </Modal>
  );
}
