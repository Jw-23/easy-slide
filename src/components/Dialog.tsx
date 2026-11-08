import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    close = useRef(onClose),
    locked = useRef(busy);
  close.current = onClose;
  locked.current = busy;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked.current) close.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !locked.current) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close.current();
        }
      }}
    >
      <header className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="关闭窗口"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
