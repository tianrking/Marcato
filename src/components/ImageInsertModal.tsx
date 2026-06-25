import { useState } from "react";
import { Modal } from "./Common";

interface ImageInsertModalProps {
  initialAlt: string;
  onClose: () => void;
  onInsert: (options: { alt: string; source: string }) => void;
}

export function ImageInsertModal({ initialAlt, onClose, onInsert }: ImageInsertModalProps) {
  const [alt, setAlt] = useState(initialAlt || "image alt");
  const [source, setSource] = useState("https://");
  const [fileName, setFileName] = useState("");

  const insert = () => {
    onInsert({ alt, source });
    onClose();
  };

  const onFileChange = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readAsDataUrl(file);
    setSource(dataUrl);
    setFileName(file.name);
    if (!alt || alt === "image alt") setAlt(file.name.replace(/\.[^.]+$/, ""));
  };

  return (
    <Modal title="Insert image" onClose={onClose}>
      <div className="insert-form">
        <label>
          <span>Image file</span>
          <input type="file" accept="image/*" onChange={(event) => void onFileChange(event.target.files?.[0])} />
        </label>
        {fileName && <small className="form-hint">Using embedded image: {fileName}</small>}
        <label>
          <span>Image URL</span>
          <input type="url" value={source} onChange={(event) => { setSource(event.target.value); setFileName(""); }} />
        </label>
        <label>
          <span>Alt text</span>
          <input value={alt} onChange={(event) => setAlt(event.target.value)} autoFocus />
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={insert}>Insert</button>
        </div>
      </div>
    </Modal>
  );
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read image file")));
    reader.readAsDataURL(file);
  });
}
