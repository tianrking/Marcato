import type { ReactNode } from "react";

export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, ReactNode, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([id, icon, label]) => (
        <button key={id} title={label} className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {icon}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="icon-button" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button onClick={onClose}>x</button>
        </div>
        {children}
      </section>
    </div>
  );
}
