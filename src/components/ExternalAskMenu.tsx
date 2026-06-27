import { Bot, Copy, ExternalLink, Search } from "lucide-react";
import { EXTERNAL_ASK_OPTIONS, type ExternalAskTarget } from "../lib/externalAsk";

interface ExternalAskMenuProps {
  x: number;
  y: number;
  selection: string;
  onClose: () => void;
  onCopyPrompt: () => void;
  onOpen: (target: ExternalAskTarget) => void;
}

export function ExternalAskMenu({ x, y, selection, onClose, onCopyPrompt, onOpen }: ExternalAskMenuProps) {
  const preview = selection.trim().replace(/\s+/g, " ").slice(0, 140) || "No selection; ask about the current document.";
  return (
    <div className="external-ask-layer" onMouseDown={onClose}>
      <section
        className="external-ask-menu"
        style={{ left: x, top: y }}
        role="menu"
        aria-label="Ask externally"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="external-ask-head">
          <Bot size={16} />
          <div>
            <strong>Ask externally</strong>
            <span>{preview}</span>
          </div>
        </div>
        <div className="external-ask-options">
          {EXTERNAL_ASK_OPTIONS.map((option) => (
            <button key={option.id} type="button" role="menuitem" title={option.hint} onClick={() => onOpen(option.id)}>
              {option.id === "google" ? <Search size={15} /> : <ExternalLink size={15} />}
              <span>{option.label}</span>
            </button>
          ))}
          <button type="button" role="menuitem" onClick={onCopyPrompt}>
            <Copy size={15} />
            <span>Copy prompt</span>
          </button>
        </div>
        <small>Selected text opens in the external service you choose.</small>
      </section>
    </div>
  );
}
