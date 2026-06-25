import { useMemo, useState } from "react";
import { Modal } from "./Common";

interface RenameTabModalProps {
  initialTitle: string;
  onClose: () => void;
  onRename: (title: string) => void;
}

const MAX_TITLE_LENGTH = 120;

export function RenameTabModal({ initialTitle, onClose, onRename }: RenameTabModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const trimmedTitle = title.trim();
  const error = useMemo(() => {
    if (!trimmedTitle) return "Enter a tab name.";
    if (trimmedTitle.length > MAX_TITLE_LENGTH) return `Keep the tab name under ${MAX_TITLE_LENGTH} characters.`;
    return "";
  }, [trimmedTitle]);

  const submit = () => {
    if (error) return;
    onRename(trimmedTitle);
  };

  return (
    <Modal title="Rename tab" onClose={onClose}>
      <form
        className="rename-tab-modal"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label>
          <span>Tab name</span>
          <input
            autoFocus
            value={title}
            maxLength={MAX_TITLE_LENGTH + 1}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={Boolean(error)}>Rename</button>
        </div>
      </form>
    </Modal>
  );
}
