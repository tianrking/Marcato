import { useState } from "react";
import { BadgeAlert, CircleAlert, Info, Lightbulb, OctagonX, TriangleAlert, type LucideIcon } from "lucide-react";
import { Modal } from "./Common";
import { MARKDOWN_ALERT_LABELS, type MarkdownAlertType } from "../lib/editorCommands";

const ALERT_TYPES: Array<{ icon: LucideIcon; type: MarkdownAlertType }> = [
  { type: "note", icon: Info },
  { type: "tip", icon: Lightbulb },
  { type: "important", icon: BadgeAlert },
  { type: "warning", icon: TriangleAlert },
  { type: "caution", icon: OctagonX },
];

export function AlertInsertModal({ onClose, onInsert }: { onClose: () => void; onInsert: (type: MarkdownAlertType) => void }) {
  const [selected, setSelected] = useState<MarkdownAlertType>("note");

  const insert = () => {
    onInsert(selected);
    onClose();
  };

  return (
    <Modal title="Markdown alerts" onClose={onClose}>
      <div className="alert-insert">
        <div className="alert-grid" role="listbox" aria-label="Markdown alert types">
          {ALERT_TYPES.map(({ icon: Icon, type }) => {
            const label = MARKDOWN_ALERT_LABELS[type];
            return (
              <button
                aria-pressed={selected === type}
                className={selected === type ? "alert-option is-selected" : "alert-option"}
                key={type}
                onClick={() => setSelected(type)}
                type="button"
              >
                <div className={`alert-preview markdown-alert markdown-alert-${type}`}>
                  <p className="markdown-alert-title"><Icon size={16} />{label}</p>
                  <p>{label} details go here.</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={insert}><CircleAlert size={16} /> Insert</button>
        </div>
      </div>
    </Modal>
  );
}
