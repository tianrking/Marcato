import { useState } from "react";
import { Modal } from "./Common";

interface LinkInsertModalProps {
  initialText: string;
  onClose: () => void;
  onInsert: (options: { text: string; url: string }) => void;
}

export function LinkInsertModal({ initialText, onClose, onInsert }: LinkInsertModalProps) {
  const [text, setText] = useState(initialText || "link text");
  const [url, setUrl] = useState("https://");

  const insert = () => {
    onInsert({ text, url });
    onClose();
  };

  return (
    <Modal title="Insert link" onClose={onClose}>
      <div className="insert-form">
        <label>
          <span>Address / URL</span>
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} autoFocus />
        </label>
        <label>
          <span>Link text</span>
          <input value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={insert}>Insert</button>
        </div>
      </div>
    </Modal>
  );
}
