import { useEffect, useState } from "react";
import { Modal } from "./Common";

interface ReferenceInsertModalProps {
  initialNumber: number;
  onClose: () => void;
  onInsert: (options: { numberText: string; title: string; url: string }) => void;
}

export function ReferenceInsertModal({ initialNumber, onClose, onInsert }: ReferenceInsertModalProps) {
  const [numberText, setNumberText] = useState(`[${initialNumber}]`);
  const [url, setUrl] = useState("https://");
  const [title, setTitle] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const insert = () => {
    onInsert({ numberText, title, url });
    onClose();
  };

  return (
    <Modal title="Insert reference" onClose={onClose}>
      <form className="insert-form" onSubmit={(event) => { event.preventDefault(); insert(); }}>
        <label>
          <span>Reference number</span>
          <input value={numberText} onChange={(event) => setNumberText(event.target.value)} autoFocus />
        </label>
        <label>
          <span>Address / Link</span>
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <label>
          <span>Title</span>
          <input value={title} placeholder="Reference title" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit">Insert</button>
        </div>
      </form>
    </Modal>
  );
}
