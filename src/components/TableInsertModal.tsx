import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Table2, type LucideIcon } from "lucide-react";
import { Modal } from "./Common";
import type { TableAlignment } from "../lib/editorCommands";

interface TableInsertModalProps {
  onClose: () => void;
  onInsert: (options: { alignment: TableAlignment; columns: number; rows: number }) => void;
}

const ALIGNMENTS: Array<{ icon: LucideIcon; label: string; value: TableAlignment }> = [
  { icon: Table2, label: "Default", value: "default" },
  { icon: AlignLeft, label: "Left", value: "left" },
  { icon: AlignCenter, label: "Center", value: "center" },
  { icon: AlignRight, label: "Right", value: "right" },
];

export function TableInsertModal({ onClose, onInsert }: TableInsertModalProps) {
  const [columns, setColumns] = useState(3);
  const [rows, setRows] = useState(2);
  const [alignment, setAlignment] = useState<TableAlignment>("default");

  const insert = () => {
    onInsert({ alignment, columns, rows });
    onClose();
  };

  return (
    <Modal title="Insert table" onClose={onClose}>
      <div className="table-insert">
        <label>
          <span>Columns</span>
          <input type="number" min={1} max={20} value={columns} onChange={(event) => setColumns(Number(event.target.value))} />
        </label>
        <label>
          <span>Rows</span>
          <input type="number" min={1} max={50} value={rows} onChange={(event) => setRows(Number(event.target.value))} />
        </label>
        <fieldset>
          <legend>Alignment</legend>
          <div className="table-align-grid">
            {ALIGNMENTS.map(({ icon: Icon, label, value }) => (
              <button key={value} type="button" className={alignment === value ? "active" : ""} onClick={() => setAlignment(value)}>
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="table-preview" aria-label="Table preview">
          <table>
            <thead>
              <tr>{Array.from({ length: Math.min(4, Math.max(1, columns)) }, (_item, index) => <th key={index}>Column {index + 1}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.min(3, Math.max(1, rows)) }, (_row, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: Math.min(4, Math.max(1, columns)) }, (_cell, columnIndex) => <td key={columnIndex}>Cell</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={insert}>Insert</button>
        </div>
      </div>
    </Modal>
  );
}
