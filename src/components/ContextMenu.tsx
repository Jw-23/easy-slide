import { useLayoutEffect, useRef, useState } from "react";
export type MenuItem = {
  label: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
};
export type MenuState = {
  x: number;
  y: number;
  title: string;
  items: MenuItem[];
  origin: HTMLElement | null;
};
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ x: menu.x, y: menu.y });
  useLayoutEffect(() => {
    const node = ref.current!,
      box = node.getBoundingClientRect();
    setPosition({
      x: Math.max(6, Math.min(menu.x, window.innerWidth - box.width - 6)),
      y: Math.max(6, Math.min(menu.y, window.innerHeight - box.height - 6)),
    });
    node.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const dismiss = (event: Event) => {
      if (!node.contains(event.target as Node)) onClose();
    };
    const scroll = (event: Event) => {
      if (event.type !== "scroll" || !node.contains(event.target as Node))
        onClose();
    };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    window.addEventListener("blur", scroll);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
      window.removeEventListener("blur", scroll);
      if (
        document.activeElement === document.body ||
        node.contains(document.activeElement)
      )
        menu.origin?.focus({ preventScroll: true });
    };
  }, [menu, onClose]);
  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={menu.title}
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ),
          i = items.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === "ArrowDown"
            ? items[(i + 1) % items.length]
            : event.key === "ArrowUp"
              ? items[(i + items.length - 1) % items.length]
              : event.key === "Home"
                ? items[0]
                : event.key === "End"
                  ? items.at(-1)
                  : undefined;
        if (next) {
          event.preventDefault();
          next.focus();
        }
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="context-menu-title">{menu.title}</div>
      {menu.items.map((item) => (
        <div key={item.label}>
          {item.separator && <hr />}
          <button
            role="menuitem"
            disabled={item.disabled}
            className={item.danger ? "danger" : ""}
            onClick={() => {
              onClose();
              void item.action();
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
