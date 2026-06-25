import { useMemo, useState } from "react";
import { Search, Shapes } from "lucide-react";
import { Modal } from "./Common";
import { DIAGRAM_TEMPLATE_CATEGORIES, DIAGRAM_TEMPLATES } from "../lib/diagramTemplates";

interface DiagramTemplateModalProps {
  onClose: () => void;
  onInsert: (value: string) => void;
}

export function DiagramTemplateModal({ onClose, onInsert }: DiagramTemplateModalProps) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const templates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return DIAGRAM_TEMPLATES.filter((template) => {
      const matchesCategory = category === "All" || template.category === category;
      if (!matchesCategory) return false;
      if (!needle) return true;
      return [
        template.title,
        template.engine,
        template.category,
        template.description,
        ...template.tags,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [category, query]);
  const [selectedId, setSelectedId] = useState(DIAGRAM_TEMPLATES[0]?.id || "");
  const selected = templates.find((template) => template.id === selectedId) || templates[0] || DIAGRAM_TEMPLATES[0];

  const insert = () => {
    if (!selected) return;
    onInsert(selected.value);
    onClose();
  };

  return (
    <Modal title="Diagram templates" onClose={onClose}>
      <div className="diagram-template-modal">
        <div className="template-search">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Search diagrams"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="template-categories" role="tablist" aria-label="Diagram template categories">
          {DIAGRAM_TEMPLATE_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? "active" : ""}
              onClick={() => {
                setCategory(item);
                setSelectedId("");
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="template-layout">
          <div className="template-list" role="listbox" aria-label="Diagram templates">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={selected?.id === template.id ? "active" : ""}
                onClick={() => setSelectedId(template.id)}
              >
                <span>
                  <Shapes size={15} />
                  <strong>{template.title}</strong>
                </span>
                <small>{template.description}</small>
                <i>{template.engine}</i>
              </button>
            ))}
            {!templates.length && <p className="modal-empty">No matching diagram templates.</p>}
          </div>

          <div className="template-preview" aria-label="Diagram template preview">
            {selected ? (
              <>
                <div>
                  <strong>{selected.title}</strong>
                  <span>{selected.description}</span>
                </div>
                <pre>{selected.value.trim()}</pre>
              </>
            ) : (
              <p className="modal-empty">Pick a template to preview it.</p>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={insert} disabled={!selected}>Insert</button>
        </div>
      </div>
    </Modal>
  );
}
