import { useId, useRef, useState, useEffect, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  Download,
  FolderOpen,
  Layers,
  Play,
  Redo2,
  Save,
  Search,
  Undo2,
  Upload,
} from "lucide-react";
import type { Studio } from "../studio/use-studio";
export function StudioHeader({
  studio: s,
  onImport,
  onHelp,
  onTemplates,
  onExport,
  onPresent,
  onSearch,
  children,
}: {
  studio: Studio;
  onImport: () => void;
  onHelp: () => void;
  onTemplates: () => void;
  onExport: () => void;
  onPresent: () => void;
  onSearch: () => void;
  children: ReactNode;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(s.deck.title);
  useEffect(() => setName(s.deck.title), [s.deck.title]);
  function rename() {
    if (name.trim()) s.rename(name.trim());
    else setName(s.deck.title);
  }
  const command = (action: () => void) => {
    menu.current?.hidePopover();
    action();
  };
  return (
    <header className="topbar">
      <span className="brand" aria-label="Easy Slide">
        <span className="brand-icon">
          <Layers size={17} />
        </span>
        <span className="brand-word">Easy Slide</span>
      </span>
      <button
        className="quiet project-menu-trigger"
        popoverTarget={id}
        aria-haspopup="menu"
      >
        工程
        <ChevronDown size={13} />
      </button>
      <div
        id={id}
        ref={menu}
        popover="auto"
        className="project-menu"
        role="menu"
        aria-label="工程操作"
        onToggle={(event) => {
          if (event.newState === "open")
            menu.current
              ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
              ?.focus();
        }}
        onKeyDown={(event) => {
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "ArrowDown"
              ? items[(index + 1) % items.length]
              : event.key === "ArrowUp"
                ? items[(index - 1 + items.length) % items.length]
                : event.key === "Home"
                  ? items[0]
                  : event.key === "End"
                    ? items.at(-1)
                    : undefined;
          if (next) {
            event.preventDefault();
            next.focus();
          }
        }}
      >
        <button
          role="menuitem"
          disabled={!s.ready || s.busy}
          onClick={() => command(() => void s.openFolder())}
        >
          <FolderOpen size={15} />
          打开本地文件夹
        </button>
        <button
          role="menuitem"
          disabled={!s.editable}
          onClick={() => command(() => void s.saveAs())}
        >
          <Save size={15} />
          工程另存为…
        </button>
        <button
          role="menuitem"
          disabled={!s.ready || s.busy}
          onClick={() => command(onImport)}
        >
          <Upload size={15} />
          导入工程
        </button>
        <button
          role="menuitem"
          disabled={!s.ready || s.busy}
          onClick={() => command(onTemplates)}
        >
          <Layers size={15} />
          示例与模板
        </button>
        <hr />
        <button role="menuitem" onClick={() => command(onHelp)}>
          <BookOpen size={15} />
          DSL 使用指南
        </button>
      </div>
      <input
        className="document-name"
        aria-label="工程名称"
        data-local-undo="true"
        value={name}
        disabled={!s.editable}
        onChange={(event) => setName(event.target.value)}
        onBlur={rename}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setName(s.deck.title);
          }
        }}
      />
      <div className="history-actions">
        <button
          className="icon-button"
          title="撤销（Ctrl / ⌘ + Z）"
          aria-label="撤销"
          disabled={!s.canUndo || s.busy}
          onClick={s.undo}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="icon-button"
          title="重做（Ctrl / ⌘ + Shift + Z）"
          aria-label="重做"
          disabled={!s.canRedo || s.busy}
          onClick={s.redo}
        >
          <Redo2 size={16} />
        </button>
      </div>
      <div className="top-actions">
        {children}
        <button
          className="icon-button"
          title="全局搜索替换（Ctrl / ⌘ + F）"
          aria-label="全局搜索替换"
          onClick={onSearch}
        >
          <Search size={16} />
        </button>
        <button
          className="icon-button help-action"
          title="DSL 使用指南"
          aria-label="DSL 使用指南"
          onClick={onHelp}
        >
          <BookOpen size={16} />
        </button>
        <button
          aria-label="保存工程"
          title="保存工程（Ctrl / ⌘ + S）"
          disabled={!s.ready || s.busy || !!s.error}
          onClick={() => void s.save()}
        >
          <Save size={15} />
          <span className="button-label">保存工程</span>
        </button>
        <button
          aria-label="导出"
          title="导出"
          disabled={!s.ready || s.busy}
          onClick={onExport}
        >
          <Download size={15} />
          <span className="button-label">导出</span>
        </button>
        <button
          className="primary"
          aria-label="演示"
          title="演示（Ctrl / ⌘ + Enter）"
          disabled={!s.editable}
          onClick={onPresent}
        >
          <Play size={14} />
          <span className="button-label">演示</span>
        </button>
      </div>
    </header>
  );
}
