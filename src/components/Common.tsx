import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

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
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const target = dialog?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])");
      (target || dialog)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")]
      .filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="modal-head">
          <strong id={titleId}>{title}</strong>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose}>x</button>
        </div>
        {children}
      </section>
    </div>
  );
}
