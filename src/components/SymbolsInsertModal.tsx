import { useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { Modal } from "./Common";

interface SymbolEntry {
  entity: string;
  name: string;
  symbol: string;
}

interface SymbolSection {
  items: SymbolEntry[];
  title: string;
}

const SYMBOL_SECTIONS: SymbolSection[] = [
  {
    title: "Common symbols",
    items: [
      { symbol: "©", entity: "&copy;", name: "copyright" },
      { symbol: "®", entity: "&reg;", name: "registered" },
      { symbol: "™", entity: "&trade;", name: "trademark" },
      { symbol: "✓", entity: "&check;", name: "check" },
      { symbol: "★", entity: "&star;", name: "star" },
      { symbol: "•", entity: "&bull;", name: "bullet" },
      { symbol: "…", entity: "&hellip;", name: "ellipsis" },
      { symbol: "—", entity: "&mdash;", name: "em dash" },
      { symbol: "–", entity: "&ndash;", name: "en dash" },
      { symbol: "→", entity: "&rarr;", name: "right arrow" },
      { symbol: "←", entity: "&larr;", name: "left arrow" },
      { symbol: "↑", entity: "&uarr;", name: "up arrow" },
      { symbol: "↓", entity: "&darr;", name: "down arrow" },
    ],
  },
  {
    title: "HTML entities",
    items: [
      { symbol: "€", entity: "&euro;", name: "euro" },
      { symbol: "£", entity: "&pound;", name: "pound" },
      { symbol: "¥", entity: "&yen;", name: "yen" },
      { symbol: "§", entity: "&sect;", name: "section" },
      { symbol: "°", entity: "&deg;", name: "degree" },
      { symbol: "±", entity: "&plusmn;", name: "plus minus" },
      { symbol: "×", entity: "&times;", name: "times" },
      { symbol: "÷", entity: "&divide;", name: "divide" },
      { symbol: "≠", entity: "&ne;", name: "not equal" },
      { symbol: "≤", entity: "&le;", name: "less equal" },
      { symbol: "≥", entity: "&ge;", name: "greater equal" },
      { symbol: "∞", entity: "&infin;", name: "infinity" },
      { symbol: "µ", entity: "&micro;", name: "micro" },
      { symbol: "¼", entity: "&frac14;", name: "quarter" },
      { symbol: "½", entity: "&frac12;", name: "half" },
      { symbol: "¾", entity: "&frac34;", name: "three quarters" },
      { symbol: "«", entity: "&laquo;", name: "left quote" },
      { symbol: "»", entity: "&raquo;", name: "right quote" },
    ],
  },
  {
    title: "Markdown-safe characters",
    items: [
      { symbol: "&", entity: "&amp;", name: "ampersand" },
      { symbol: "<", entity: "&lt;", name: "less than" },
      { symbol: ">", entity: "&gt;", name: "greater than" },
      { symbol: "\"", entity: "&quot;", name: "double quote" },
      { symbol: "'", entity: "&#39;", name: "apostrophe" },
      { symbol: "|", entity: "&#124;", name: "pipe" },
      { symbol: "\\", entity: "&#92;", name: "backslash" },
      { symbol: "`", entity: "&#96;", name: "backtick" },
      { symbol: "*", entity: "&#42;", name: "asterisk" },
      { symbol: "_", entity: "&#95;", name: "underscore" },
      { symbol: "{", entity: "&#123;", name: "left brace" },
      { symbol: "}", entity: "&#125;", name: "right brace" },
      { symbol: "[", entity: "&#91;", name: "left bracket" },
      { symbol: "]", entity: "&#93;", name: "right bracket" },
      { symbol: "(", entity: "&#40;", name: "left parenthesis" },
      { symbol: ")", entity: "&#41;", name: "right parenthesis" },
    ],
  },
];

export function SymbolsInsertModal({ onClose, onInsert }: { onClose: () => void; onInsert: (entities: string[]) => void }) {
  const [copied, setCopied] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SYMBOL_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !needle || `${item.symbol} ${item.entity} ${item.name}`.toLowerCase().includes(needle)),
      }))
      .filter((section) => section.items.length > 0);
  }, [query]);

  const orderedSelection = SYMBOL_SECTIONS
    .flatMap((section) => section.items)
    .filter((item) => selected.has(item.entity))
    .map((item) => item.entity);

  const toggle = (entity: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  };

  const copyEntity = async (entity: string) => {
    await navigator.clipboard.writeText(entity);
    setCopied(entity);
    window.setTimeout(() => setCopied((current) => (current === entity ? "" : current)), 900);
  };

  const insert = () => {
    if (!orderedSelection.length) return;
    onInsert(orderedSelection);
    onClose();
  };

  return (
    <Modal title="Symbols & HTML entities" onClose={onClose}>
      <div className="insert-form">
        <label>
          <span>Search</span>
          <input value={query} placeholder="Search symbols" onChange={(event) => setQuery(event.target.value)} autoFocus />
        </label>
        <div className="symbol-grid" role="listbox" aria-label="Symbol list">
          {sections.map((section) => (
            <section className="symbol-section" key={section.title}>
              <p className="symbol-section-title">{section.title}</p>
              <div className="symbol-section-grid">
                {section.items.map((item) => (
                  <div
                    aria-selected={selected.has(item.entity)}
                    className={selected.has(item.entity) ? "symbol-item is-selected" : "symbol-item"}
                    key={item.entity}
                    onClick={() => toggle(item.entity)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggle(item.entity);
                    }}
                    role="option"
                    tabIndex={0}
                  >
                    <span className="symbol-preview">{item.symbol}</span>
                    <span className="symbol-code">
                      <span>{item.entity}</span>
                      <button
                        aria-label={`Copy ${item.entity}`}
                        className={copied === item.entity ? "symbol-copy-btn is-copied" : "symbol-copy-btn"}
                        onClick={(event) => { event.stopPropagation(); void copyEntity(item.entity); }}
                        type="button"
                      >
                        {copied === item.entity ? <Check size={14} /> : <Clipboard size={14} />}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {!sections.length && <p className="modal-empty">No symbols found.</p>}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!orderedSelection.length} onClick={insert}>Insert</button>
        </div>
      </div>
    </Modal>
  );
}
